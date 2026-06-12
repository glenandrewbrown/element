// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <memory>
#include <vector>

#include <element/plugins.hpp>
#include <element/settings.hpp>

#include "engine/sandboxhost.hpp"
// ui/ include from engine/ is deliberate: favourite status (the user's starred
// plugins) drives parked-shelf eviction, and the tracker is already owned by
// PluginManager which this pool hangs off.
#include "ui/pluginusagetracker.hpp"

namespace element {

//==============================================================================
/**
    Process-wide pool of sandbox worker processes (T7 warm pool + instance
    reuse, 2026-06-11 — see .omc/state/qa-wave-reports/kontakt-load-forensics-
    2026-06-11.md for the measurements that motivated this).

    Two shelves:

    - BLANK shelf (T7): workers that are pre-launched (handshake complete,
      plugin formats registered in the child) but host no plugin yet. Claiming
      one skips process spawn + connectToPipe (~1.5-2.5 s of every add).

    - PARKED shelf (instance reuse): workers still hosting a LOADED plugin,
      parked when their SandboxedProcessorNode was destroyed (node deleted, or
      torn down by a session re-open). Claiming one for the same plugin skips
      the ENTIRE load — the route to ~instant re-adds of heavy instruments
      (Kontakt) and to session re-opens that stop re-loading every sandboxed
      plugin from scratch.

    THREADING
    - All public methods run on the MESSAGE THREAD (same contract as
      SandboxHost's non-RT API). jassert-guarded.
    - Replenish handshakes run on an internal single-thread ThreadPool using
      the SAME 3-phase split GraphManager uses for cold launches:
      beginDeferredLaunch (atomics, safe anywhere) → runWorkerHandshake
      (blocking, pool thread) → finishDeferredLaunch (message thread via
      callAsync). The message thread never blocks on a spawn.
    - Hosts are handed to the message thread through a raw pointer owned by
      the in-flight lambda chain; if the pool died meanwhile the callAsync
      shuts the orphan worker down. If the app quits with a callAsync pending
      the host leaks for the final milliseconds of the process — harmless.

    HEALTH
    - Shelved workers are validated AT CLAIM TIME (isHealthy + expected load
      state); a rotten entry is shut down and skipped. No background polling —
      a parked worker that crashes simply fails validation later. SandboxHost's
      own crash/restart machinery stays armed while shelved, so a parked
      worker that dies restarts itself and is usually healthy again by claim.

    SIZING
    - Blank target: Settings::getSandboxWarmPoolSize() (default 1, 0 = off).
    - Parked cap: Settings::getMaxParkedSandboxInstances() (default 3, 0 =
      off). Eviction prefers the oldest NON-favourite entry (favourites — the
      plugins the user marked in the browser — are the ones worth keeping
      warm); if all parked entries are favourites the oldest goes.
*/
class SandboxWorkerPool
{
public:
    explicit SandboxWorkerPool (PluginManager& pm) : plugins (pm) {}

    ~SandboxWorkerPool()
    {
        // Stop replenish jobs first (they capture `this` via WeakReference —
        // interrupt + wait so none observe a half-dead pool), then drop shelves.
        replenishThreads.removeAllJobs (true, 4000);
        clear();
    }

    //==========================================================================
    /** Claim the best available worker for `desc`: a parked instance already
        hosting this plugin if one exists, otherwise a blank warm worker,
        otherwise nullptr (caller takes the cold-launch path). On a parked hit
        `outWasLoaded` is true and the caller must NOT loadPlugin again.
        Always triggers an async replenish of the blank shelf. */
    std::unique_ptr<SandboxHost> claim (const juce::PluginDescription& desc,
                                        bool& outWasLoaded)
    {
        jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
        outWasLoaded = false;

        if (auto host = claimParked (desc))
        {
            outWasLoaded = true;
            replenishAsync();
            return host;
        }

        auto host = claimBlank();
        replenishAsync();
        return host;
    }

    /** Park a healthy, still-loaded worker for later re-claim. Returns false
        (caller keeps ownership / shuts down) when parking is disabled, the
        shelf is full and nothing could be evicted, or the host fails the
        health gate. */
    bool park (std::unique_ptr<SandboxHost> host, const juce::PluginDescription& desc)
    {
        jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());

        const int maxParked = parkedMaxOverride >= 0
            ? parkedMaxOverride
            : Settings().getMaxParkedSandboxInstances();
        if (maxParked <= 0 || host == nullptr)
            return false;
        if (! (host->isHealthy() && host->isPluginLoaded()))
        {
            juce::Logger::writeToLog ("[sandbox-pool] park rejected \"" + desc.name
                                      + "\" — worker "
                                      + (host->isHealthy() ? "has no plugin loaded" : "unhealthy"));
            return false;
        }

        while ((int) parked.size() >= maxParked)
            if (! evictOne())
                return false;

        juce::Logger::writeToLog ("[sandbox-pool] park \"" + desc.name + "\" ("
                                  + juce::String ((int) parked.size() + 1) + " parked)");
        parked.push_back ({ std::move (host), desc, juce::Time::getMillisecondCounter() });
        return true;
    }

    /** Ensure the blank shelf is filling toward its target (non-blocking). */
    void replenishAsync()
    {
        jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());

        const int target = warmTarget();
        while ((int) blanks.size() + inFlight < target)
        {
            ++inFlight;
            juce::WeakReference<SandboxWorkerPool> weakThis (this);
            auto* pm = &plugins; // PluginManager outlives the pool (it owns it)
            replenishThreads.addJob ([weakThis, pm]
            {
                // POOL THREAD. Construct + handshake. The host pointer travels
                // raw through the lambda chain (std::function must stay
                // copyable); ownership lands back in a unique_ptr on the
                // message thread.
                auto* host = new SandboxHost (*pm);
                const bool armed = host->beginDeferredLaunch();
                const bool ok = armed && host->runWorkerHandshake();

                juce::MessageManager::callAsync ([weakThis, host, ok]
                {
                    std::unique_ptr<SandboxHost> owned (host);
                    auto* self = weakThis.get();
                    if (self != nullptr)
                        --self->inFlight;

                    if (! ok)
                    {
                        // Spawn failed (helper missing/unsignable). finish with
                        // false rolls the host to Idle; drop it. Do NOT retry in
                        // a loop — the next claim() re-attempts naturally.
                        owned->finishDeferredLaunch (false);
                        return;
                    }

                    owned->finishDeferredLaunch (true); // Timer arms here (msg thread)

                    if (self == nullptr
                        || (int) self->blanks.size() + self->inFlight
                               >= self->warmTarget())
                    {
                        owned->shutdown(); // pool gone or shelf already full
                        return;
                    }

                    juce::Logger::writeToLog ("[sandbox-pool] warm worker ready ("
                                              + juce::String ((int) self->blanks.size() + 1)
                                              + " blank)");
                    self->blanks.push_back (std::move (owned));
                });
            });
        }
    }

    /** Speculatively pre-instantiate a parked SPARE of `desc` in a background
        worker, so the NEXT add of the same plugin adopts it instantly. Called
        after a plugin finishes loading (live add, session load, or a parked
        adoption — adopting empties the shelf, and this refills it). Gated:
        parking enabled, the load was EXPENSIVE (instantiationMs ≥ threshold —
        Kontakt-class instruments qualify, 100 ms utility plugins never), no
        parked spare of this plugin already shelved, no preload already in
        flight. Message thread only. */
    void maybePreinstantiate (const juce::PluginDescription& desc, juce::uint32 instantiationMs)
    {
        jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());

        const int maxParked = parkedMaxOverride >= 0
            ? parkedMaxOverride
            : Settings().getMaxParkedSandboxInstances();
        if (maxParked <= 0)
            return;

        const juce::uint32 minMs = preinstantiateMinMsOverride >= 0
            ? (juce::uint32) preinstantiateMinMsOverride
            : kPreinstantiateMinMs;
        if (instantiationMs < minMs)
            return;

        for (const auto& p : parked)
            if (sameIdentity (p.desc, desc))
                return; // a spare is already shelved

        // RT-audit LOW-2 (2026-06-12): a FULL shelf of other plugins means the
        // spare we'd spawn could only land by evicting an existing entry —
        // possibly a user favourite — after a wasted multi-second background
        // load. Refuse instead; the shelf is doing its job for other plugins.
        if ((int) parked.size() >= maxParked)
            return;

        expireStalePreloads();
        for (const auto& e : preloads)
            if (sameIdentity (e->desc, desc))
                return; // already pre-instantiating this plugin
        if (! preloads.empty())
            return; // one speculative spawn at a time — bounds RAM + CPU

        startPreload (desc);
    }

    /** Shut down every shelved worker (session end / app exit). */
    void clear()
    {
        for (auto& b : blanks)
            if (b != nullptr)
                b->shutdown();
        blanks.clear();
        for (auto& p : parked)
            if (p.host != nullptr)
                p.host->shutdown();
        parked.clear();
        for (auto& e : preloads)
        {
            if (e->host != nullptr)
            {
                e->host->removeListener (e.get());
                e->host->shutdown();
            }
        }
        preloads.clear();
    }

    int numBlank() const noexcept { return (int) blanks.size(); }
    int numParked() const noexcept { return (int) parked.size(); }
    int numPreloading() const noexcept { return (int) preloads.size(); }

    // TEST SEAMS: override the Settings-driven sizes (-1 = use Settings).
    // Unit tests must not read or mutate the user's real preferences file.
    int warmTargetOverride { -1 };
    int parkedMaxOverride { -1 };
    int preinstantiateMinMsOverride { -1 }; // -1 = kPreinstantiateMinMs

private:
    struct ParkedInstance
    {
        std::unique_ptr<SandboxHost> host;
        juce::PluginDescription desc;
        juce::uint32 parkedAtMs { 0 };
    };

    /** Only loads slower than this earn a speculative spare. Kontakt-class
        instruments measure 7-15 s; utility plugins are ~100 ms. */
    static constexpr juce::uint32 kPreinstantiateMinMs = 2000;
    /** A preload whose worker never reports loaded is abandoned after this. */
    static constexpr juce::uint32 kPreloadStaleMs = 180'000;

    /** One in-flight speculative pre-instantiation. The adapter listens to the
        spare host's load outcome; callbacks arrive on the host's IPC thread, so
        they only bounce a WeakReference'd completion to the message thread —
        the pool's shelves stay message-thread-only. */
    struct Preload : public SandboxHost::Listener
    {
        Preload (SandboxWorkerPool& p, const juce::PluginDescription& d)
            : pool (p), desc (d), startedMs (juce::Time::getMillisecondCounter()) {}

        void sandboxPluginLoaded (SandboxHost*) override { finish (true); }
        void sandboxPluginLoadFailed (SandboxHost*, const juce::String&) override { finish (false); }
        void sandboxCrashed (SandboxHost*) override { finish (false); }

        void finish (bool ok)
        {
            // IPC THREAD. completePreload validates `self` is still a live
            // entry BEFORE any dereference (the entry may have been expired /
            // cleared between this callback and the async landing).
            juce::WeakReference<SandboxWorkerPool> weakPool (&pool);
            auto* self = this;
            juce::MessageManager::callAsync ([weakPool, self, ok] {
                if (auto* p = weakPool.get())
                    p->completePreload (self, ok);
            });
        }

        SandboxWorkerPool& pool;
        juce::PluginDescription desc;
        std::unique_ptr<SandboxHost> host;
        juce::uint32 startedMs { 0 };
    };

    bool isPreloadActive (const Preload* e) const noexcept
    {
        for (const auto& p : preloads)
            if (p.get() == e)
                return true;
        return false;
    }

    void erasePreload (const Preload* e)
    {
        for (int i = (int) preloads.size(); --i >= 0;)
            if (preloads[(size_t) i].get() == e)
                preloads.erase (preloads.begin() + i);
    }

    void expireStalePreloads()
    {
        const auto now = juce::Time::getMillisecondCounter();
        for (int i = (int) preloads.size(); --i >= 0;)
        {
            auto& e = preloads[(size_t) i];
            if (now - e->startedMs < kPreloadStaleMs)
                continue;
            juce::Logger::writeToLog ("[sandbox-pool] pre-instantiation of \""
                                      + e->desc.name + "\" stalled — abandoning");
            if (e->host != nullptr)
            {
                e->host->removeListener (e.get());
                e->host->shutdown();
            }
            preloads.erase (preloads.begin() + i);
        }
    }

    void startPreload (const juce::PluginDescription& desc)
    {
        auto entry = std::make_unique<Preload> (*this, desc);
        auto* e = entry.get();
        preloads.push_back (std::move (entry));
        juce::Logger::writeToLog ("[sandbox-pool] pre-instantiating spare \"" + desc.name + "\"");

        // Same 3-phase split as replenishAsync: blocking handshake on the pool
        // thread, ownership + Timer arm + loadPlugin land on the message thread.
        juce::WeakReference<SandboxWorkerPool> weakThis (this);
        auto* pm = &plugins;
        replenishThreads.addJob ([weakThis, pm, e]
        {
            // POOL THREAD.
            auto* host = new SandboxHost (*pm);
            const bool armed = host->beginDeferredLaunch();
            const bool ok = armed && host->runWorkerHandshake();

            juce::MessageManager::callAsync ([weakThis, host, e, ok]
            {
                std::unique_ptr<SandboxHost> owned (host);
                auto* self = weakThis.get();
                if (self == nullptr || ! self->isPreloadActive (e))
                {
                    // Pool died or the entry was expired/cleared meanwhile.
                    owned->finishDeferredLaunch (false);
                    return;
                }
                if (! ok)
                {
                    owned->finishDeferredLaunch (false);
                    self->erasePreload (e);
                    return;
                }
                owned->finishDeferredLaunch (true); // Timer arms (msg thread)
                e->host = std::move (owned);
                e->host->addListener (e);
                e->host->loadPlugin (e->desc); // non-atomic write — msg thread only
            });
        });
    }

    void completePreload (Preload* e, bool ok)
    {
        jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
        if (! isPreloadActive (e)) // expired / cleared / double callback
            return;

        if (e->host != nullptr)
            e->host->removeListener (e);

        if (ok && e->host != nullptr)
        {
            auto desc = e->desc;
            auto host = std::move (e->host);
            erasePreload (e); // e dangles past this line
            // park() logs; on refusal the unique_ptr's destructor shuts the
            // spare down — never reaches the shelf in a half state.
            park (std::move (host), desc);
            return;
        }

        if (e->host != nullptr)
            e->host->shutdown();
        erasePreload (e);
    }

    /** Blank-shelf target — override-aware (RT-verdict MINOR-1: every sizing
        decision, including the replenish-landing re-check, must honour the
        test seam so headless tests never read the user's real Settings). */
    int warmTarget() const
    {
        return warmTargetOverride >= 0 ? warmTargetOverride
                                       : Settings().getSandboxWarmPoolSize();
    }

    static bool sameIdentity (const juce::PluginDescription& a, const juce::PluginDescription& b)
    {
        return a.fileOrIdentifier == b.fileOrIdentifier
            && a.pluginFormatName == b.pluginFormatName;
    }

    std::unique_ptr<SandboxHost> claimParked (const juce::PluginDescription& desc)
    {
        // Newest match first (warmest). Rotten entries are shut down + dropped.
        for (int i = (int) parked.size(); --i >= 0;)
        {
            if (! sameIdentity (parked[(size_t) i].desc, desc))
                continue;

            auto entry = std::move (parked[(size_t) i]);
            parked.erase (parked.begin() + i);

            if (entry.host->isHealthy() && entry.host->isPluginLoaded())
            {
                juce::Logger::writeToLog ("[sandbox-pool] claim parked \"" + desc.name + "\"");
                return std::move (entry.host);
            }
            // Rotten — discard, keep scanning older ones. Logged so a live
            // session can tell "match found but dead" from "no match at all".
            juce::Logger::writeToLog ("[sandbox-pool] parked \"" + desc.name
                                      + "\" entry rotten — discarding");
            entry.host->shutdown();
        }
        if (! parked.empty())
            juce::Logger::writeToLog ("[sandbox-pool] no parked match for \"" + desc.name
                                      + "\" (" + juce::String ((int) parked.size()) + " parked)");
        return nullptr;
    }

    std::unique_ptr<SandboxHost> claimBlank()
    {
        while (! blanks.empty())
        {
            auto host = std::move (blanks.back());
            blanks.pop_back();
            if (host->isHealthy() && ! host->isPluginLoaded()
                && host->getState() == SandboxHost::State::Ready)
            {
                juce::Logger::writeToLog ("[sandbox-pool] claim warm worker ("
                                          + juce::String ((int) blanks.size()) + " left)");
                return host;
            }
            host->shutdown();
        }
        return nullptr;
    }

    bool evictOne()
    {
        if (parked.empty())
            return false;

        // Oldest non-favourite first; favourites are exactly the plugins worth
        // keeping warm. All-favourites: the oldest goes anyway.
        auto& tracker = plugins.getUsageTracker();
        int victim = -1;
        for (int i = 0; i < (int) parked.size(); ++i)
        {
            if (! tracker.isFavorite (parked[(size_t) i].desc))
            {
                victim = i;
                break;
            }
        }
        if (victim < 0)
            victim = 0;

        juce::Logger::writeToLog ("[sandbox-pool] evict parked \""
                                  + parked[(size_t) victim].desc.name + "\"");
        parked[(size_t) victim].host->shutdown();
        parked.erase (parked.begin() + victim);
        return true;
    }

    PluginManager& plugins;
    std::vector<std::unique_ptr<SandboxHost>> blanks;
    std::vector<ParkedInstance> parked;
    std::vector<std::unique_ptr<Preload>> preloads; // message thread only
    int inFlight { 0 }; // replenish jobs not yet landed (message-thread only)
    juce::ThreadPool replenishThreads { 1 };

    JUCE_DECLARE_WEAK_REFERENCEABLE (SandboxWorkerPool)
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxWorkerPool)
};

} // namespace element
