// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/context.hpp>
#include <element/juce/gui_basics.hpp>
#include <element/juce/gui_extra.hpp>
#include <element/signals.hpp>
#include <element/web_metering_fifo.hpp>

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace element {

#if JUCE_WEB_BROWSER

class WebContent;
struct ElementWebViewLogForwarder;

//==============================================================================
/**
    Hosts JUCE WebBrowserComponent with ResourceProvider, native functions, and a 60Hz timer
    that forwards metering + graph state to the React bundle.
*/
class ElementWebViewHost final : public juce::Component,
                                 private juce::Timer,
                                 private juce::ValueTree::Listener {
public:
    /** If skipBrowser is true, the WebBrowserComponent is not created (used only by unit tests). */
    explicit ElementWebViewHost (Context& ctx, bool skipBrowser = false);
    ~ElementWebViewHost() override;

    Context& getContext() const { return context; }

    /** Parent shell (optional) — used for overlay views opened from bridge natives. */
    void setWebShell (WebContent* shell) noexcept { webShell = shell; }

    WebMeteringFifo& getMeteringFifo() noexcept { return metering; }

    /** Called from the audio thread — must be wait-free (delegates to metering FIFO). */
    void submitAudioPeak (float peak) noexcept { metering.pushPacket (peak); }

    void pushGraphSnapshot();
    void pushMeteringIfNeeded();

    /** Plugin UI embedded above the browser (same coordinate space as WebBrowserComponent). */
    void pluginEditorOpen (const juce::String& nodeUuid, int x, int y, int w, int h);
    void pluginEditorClose();
    void pluginEditorSetBounds (int x, int y, int w, int h);
    /** Detach to a floating PluginWindow and hide the embed slot. */
    void pluginEditorFloat();

    void paintChildrenWithUnifiedOrigin (juce::Graphics&) const { /* WebView handles itself */ }

    /** @internal */
    void resized() override;
    void visibilityChanged() override;

    // ── Test-harness support ─────────────────────────────────────────────────
    /** Callable type matching opts.withNativeFunction lambda signature. */
    using BridgeFn = std::function<void (const juce::Array<juce::var>&,
                                         std::function<void (const juce::var&)>)>;

    /** Invoke a registered bridge function by name and collect the result
        synchronously (blocks the calling thread until the completion callback
        fires on the message thread).  Used only by BridgeContractTest.
        Returns var::undefined if the name is not found. */
    juce::var invokeForTest (const juce::String& name, const juce::Array<juce::var>& args);

private:
    friend struct ElementWebViewLogForwarder;
    friend class BridgeContractTest;

    void timerCallback() override;
    void valueTreePropertyChanged (juce::ValueTree&, const juce::Identifier&) override;
    void valueTreeChildAdded (juce::ValueTree&, juce::ValueTree&) override;
    void valueTreeChildRemoved (juce::ValueTree&, juce::ValueTree&, int) override;
    void valueTreeChildOrderChanged (juce::ValueTree&, int, int) override;
    void valueTreeParentChanged (juce::ValueTree&) override;
    void valueTreeRedirected (juce::ValueTree&) override;

    void attachSessionListener();
    void detachSessionListener();
    void scheduleGraphPush (int debounceMs = 40);

    bool isUnderActiveGraph (const juce::ValueTree& start) const;
    bool shouldIgnoreSessionRootProperty (const juce::Identifier& prop) const;

    // ── Container dive (P2-A1, host side) ────────────────────────────────────
    /** Navigation stack of nested-container node UUIDs, top-level → deepest.
        EMPTY means "at the top-level active graph" — the default, identical to
        pre-dive behaviour. Each entry is the UUID of a Container Block
        (`Node::isGraph()`) one level deeper than the previous. */
    juce::Array<juce::String> boardPath;

    /** The board the snapshot currently walks. When `boardPath` is empty this is
        EXACTLY `session->getActiveGraph()` (byte-identical to the pre-dive
        snapshot). Otherwise it resolves the active graph and descends one
        direct-child container per `boardPath` entry; an unresolvable / non-graph
        entry stops the walk at the deepest valid board. */
    Node currentBoard() const;

    /** Like `isUnderActiveGraph` but rooted at `currentBoard()`. When not dived
        (`boardPath` empty) `currentBoard() == getActiveGraph()`, so this reduces
        to `isUnderActiveGraph` exactly. Used by the graph-mutation listeners so
        edits INSIDE the dived board still schedule a push. */
    bool isUnderCurrentBoard (const juce::ValueTree& start) const;

    /** If `removedUuid` is the current board or one of its ancestors in
        `boardPath`, truncate the path to just above the removed node so the
        canvas exits to a surviving board instead of pointing at a deleted graph.
        No-op when the removed node is not on the path. Message thread only. */
    void truncateBoardPathOnNodeRemoval (const juce::String& removedUuid);

    juce::String buildActiveGraphJson() const;
    /** Per-cable levels for Web §2.4 (message thread; reads processor RMS / MIDI activity). */
    juce::String buildCableLevelsJson() const;
    /** Per-NODE output levels (Q-VU-PER-BLOCK / Pillar-2 D1). Message thread;
        reads each node's atomic per-channel output RMS (or MIDI activity) so a
        Block's VU reflects REAL signal even with no outgoing cable (terminal /
        unconnected). Keyed by the node UUID the React Block components use. */
    juce::String buildNodeMetersJson() const;
    /** Master output L/R + audio-input peak (Q-VU-LR / Q-VU-INPUT, Pillar-2
        D2/D3). Message thread; reads the engine's already-maintained per-channel
        output LevelMeters (atomic `_level`) for L/R and the audio-input node's
        output RMS for the input peak. Returns `{}` when no engine/graph. */
    juce::String buildMasterLevelsJson() const;
    /** Per-NODE per-CHANNEL output levels for surround/multi-channel meters
        (G3-B item 2). Message thread; emits {id, ch:[lvl0,lvl1,...]} per node
        reading EVERY output-RMS lane (getOutputRMS(c) for c in
        [0,getNumOutputRMSChannels())) with the SAME calibration as
        nodeOutputLevel. The single-scalar onNodeLevels channel keeps driving
        the Block VU; this channel feeds the BusInspector's per-lane columns. */
    juce::String buildNodeChannelLevelsJson() const;
    juce::String buildPluginListJson() const;
    juce::String buildNodeParametersJson (const juce::String& nodeUuid) const;
    bool setNodeParameterValue (const juce::String& nodeUuid, int paramIndex, float value);

    /** Set the integer "mode" of a built-in logic/comparator node (element.compare /
        element.logic). Resolves nodeUuid → Node → Processor, casts to ComparatorNode
        (setOperator) or LogicGateNode (setMode), both thread-safe relaxed-atomic stores.
        Returns true when the node was found and the mode applied, false otherwise. */
    bool setNodeIntMode (const juce::String& nodeUuid, int mode);

    /** Push 15Hz delta of changed AudioProcessorParameter values to the WebView.
        Walks the active graph, polls all node parameters, diffs against the cached
        last-pushed value (epsilon 1e-4f), and emits a compact JSON array via
        `window.__elementNative.onParameterUpdate(...)`. Called from `timerCallback`
        every 4th tick. Cache is pruned of stale node entries on each push so it
        cannot grow unbounded across session changes. */
    void pushParameterUpdates();

    void evalInBrowser (const juce::String& js);

    Context& context;
    WebContent* webShell = nullptr;
    std::unique_ptr<ElementWebViewLogForwarder> logForwarder;
    std::unique_ptr<juce::WebBrowserComponent> browser;
    WebMeteringFifo metering;

    juce::ValueTree attachedSessionRoot;
    bool listenerAttached = false;
    int graphPushPendingMs = 0;

    /** T3 (⌥+drop add-and-connect): a deferred absolute-position apply for the
        node a just-posted AddPluginMessage is about to create. The add is async
        (postMessage), so we record the drop coords + the set of node UUIDs that
        existed BEFORE the add; on a later timer tick we find the single new UUID
        on the same board and setPosition() it to the drop point, then push. */
    struct PendingConnectedAdd
    {
        bool active = false;
        double flowX = 0.0;
        double flowY = 0.0;
        juce::StringArray preExistingUuids;
        juce::Array<juce::String> boardPathSnapshot;
        int waitedTicks = 0;
    };
    PendingConnectedAdd pendingConnectedAdd;

    /** UUIDs last stored by `elementGraphCopyNodes` for `elementGraphPasteNodes` (host-side pasteboard). */
    juce::StringArray graphCopyPasteboard;

    /** Last `SessionService::hasSessionChanged()` pushed to the Web snapshot (for ~2Hz dirty refresh). */
    bool lastPushedSessionDirty = false;
    int dirtyPollCounter = 0;

    /** 15Hz parameter delta channel: counter ticks every 60Hz callback, push every 4th. */
    int parameterPushCounter = 0;
    /** Cache of last-pushed parameter values keyed by "<uuid>:<paramIndex>". */
    std::unordered_map<std::string, float> lastPushedParamValues;

    bool logPushPending = false;
    int lastLogHistorySize = 0;

    /** P1-11: connection to EngineService::sigEngineStateChanged. */
    SignalConnection engineStateChangedConnection;

    /** R3: connection to PluginManager::sigSandboxEvent — surfaces out-of-process
        plugin crash / restart / load-failure to the React Block as a
        "plugin crashed — reload" affordance. */
    SignalConnection sandboxEventConnection;

    /** Dispatch a sandbox lifecycle event to the webview (message thread). */
    void emitSandboxEventToWeb (juce::uint32 nodeId, int kind, const juce::String& reason);

    std::unique_ptr<juce::Component> pluginEmbedEditor;
    juce::Rectangle<int> pluginEmbedBounds;
    juce::String pluginEmbedNodeUuid;

    /** Map of registered bridge function name → callable.
        Populated during construction alongside opts.withNativeFunction so
        that BridgeContractTest can invoke functions without a live browser. */
    std::unordered_map<std::string, BridgeFn> bridgeFunctions;

    /** UUIDs of nodes a webview consumer has subscribed to FFT spectrum for
        (G3-B item 1). `elementSetNodeSpectrumWanted(uuid,true)` adds; (…,false)
        removes; `elementGetNodeSpectrum(uuid)` also adds (poll == subscribe).
        Each timerCallback re-asserts setSpectrumWanted(true) on the live set and
        clears the atomic on any node that dropped out / left the graph, so the
        audio-thread tap (and its FFT) costs nothing for unviewed nodes even if
        the webview tears down without an explicit unsubscribe. */
    std::unordered_set<std::string> spectrumSubscriptions;

    void rebuildPluginEmbedLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ElementWebViewHost)
};

//==============================================================================
// N2 / Decision D-1 — alias-aware VST3-primary plugin dedupe (presentation-only).
//
// Groups scanned plugins by (manufacturer, name): a family with multiple format
// variants (VST3 + AU + …) emits ONE primary row (VST3 preferred) carrying the
// `PluginGroup` metadata below. A solitary plugin emits a single-variant group
// (aliases == [its own id]). This is a PURE view transform over the scanned
// list — it NEVER mutates KnownPluginList or any saved identifier; saved .elg
// projects keep resolving their exact (possibly-AU) identifier independently.
//
// Free function (not a member) so it is unit-testable headless with no Context:
// callers pass the live PluginDescription list + the persisted usage/favorite/
// recent data, and receive the grouped rows ready to serialise. O(n log n).
// Each variant is emitted as a {format, identifier} JSON object inside the
// row's `variants` array — see buildPluginGroupRows.

/** Inputs for one scanned plugin (a thin, test-friendly view of PluginDescription). */
struct PluginGroupSource
{
    juce::String name;
    juce::String manufacturer;
    juce::String format;        // pluginFormatName
    juce::String identifier;    // createIdentifierString()
    bool isInstrument = false;
    int numInputChannels = 0;
    int numOutputChannels = 0;
    juce::String category;      // raw category (or empty)
    juce::String version;
    juce::String descriptiveName;
};

/** Build the grouped plugin rows as a JSON-ready var Array.
    @param sources      one entry per scanned plugin, in list order.
    @param usageCounts  identifier → real persisted use-count.
    @param favorites    favourited identifiers (exact, as persisted).
    @param recents      recently-used identifiers, most-recent-first.
    Each emitted row is the primary variant's row PLUS the group fields
    (aliases[], variants[{format,identifier}], aggregated usageCount,
    isFavorite = any alias starred, recentRank = best alias rank | -1).
    Stable: family order follows first-appearance of the primary in `sources`. */
juce::Array<juce::var> buildPluginGroupRows (const std::vector<PluginGroupSource>& sources,
                                             const std::map<juce::String, int>& usageCounts,
                                             const juce::StringArray& favorites,
                                             const juce::StringArray& recents);

#endif // JUCE_WEB_BROWSER

} // namespace element
