// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <chrono>
#include <cstdint>
#include <string>
#include <thread>

#if __APPLE__ || __linux__
 #include <fcntl.h>
 #include <semaphore.h>
 #include <sys/stat.h>
 #include <unistd.h>
 #include <cerrno>
 #include <ctime>
#elif _WIN32
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

namespace element {

//==============================================================================
/**
 * Cross-process semaphore for sandbox audio IPC signaling (Phase D D-2).
 *
 * Uses kernel-named primitives so host and worker — separate processes that
 * cannot share user-space addresses — can signal each other:
 *   - macOS / Linux: `sem_open()` named POSIX semaphore at `/<name>`.
 *   - Windows: `CreateEventW()` / `OpenEventW()` named auto-reset event.
 *
 * Naming convention (architect memo §2.4):
 *   `/els_<pid>_<counter>_<suffix>` where suffix is one char (`t`=trigger,
 *   `d`=done). Total length ≤ 21 chars including the leading `/`, well
 *   under macOS's 31-char `sem_open` limit.
 *
 * Lifecycle:
 *   1. Host calls `open(name, Mode::Owner)` — creates kernel object + filesystem
 *      entry under `O_CREAT | O_EXCL`.
 *   2. Host serialises the name into the PreparePayload pipe message.
 *   3. Worker receives the name and calls `open(name, Mode::Attacher)` —
 *      opens an additional FD on the existing kernel object.
 *   4. Both processes use `post()` and `timedWait()` for cross-process signal.
 *   5. On destructor:
 *        - Owner closes its FD AND `sem_unlink`s the filesystem entry (kernel
 *          object lives until last FD is closed — the worker's FD keeps it
 *          alive until the worker also exits).
 *        - Attacher just closes its FD.
 *
 * Crash recovery:
 *   If the host SIGKILLs before the destructor runs, the filesystem entry
 *   `/dev/sem/els_*` (Linux) or the equivalent macOS namespace entry leaks.
 *   Mitigation: future startup-time sweep of `/els_*` names with dead PIDs
 *   (architect §2.3 recommendation; not yet implemented — D-9 stress test
 *   will surface any leaks for follow-up).
 *
 * macOS quirk:
 *   `sem_timedwait()` is NOT implemented for named semaphores on macOS — only
 *   for unnamed ones from `sem_init()`. We poll `sem_trywait()` + `usleep(50)`
 *   until the deadline. The 50 µs granularity is fine because the audio
 *   thread's spin phase already burns ~390 µs in `_mm_pause` before falling
 *   back to the semaphore wait (sandboxhost.hpp:444-468).
 *
 * `post()` is RT-safe: kernel syscalls only, no allocation, never blocks.
 */
class SandboxSemaphore
{
public:
    enum class Mode { Owner, Attacher };

    SandboxSemaphore() = default;

    ~SandboxSemaphore()
    {
        close();
    }

    // Non-copyable.
    SandboxSemaphore (const SandboxSemaphore&) = delete;
    SandboxSemaphore& operator= (const SandboxSemaphore&) = delete;

    /** Open or create a named cross-process semaphore.
        Returns true on success.
        - Mode::Owner: creates with O_CREAT|O_EXCL — fails if name already exists.
        - Mode::Attacher: opens an existing one by name — fails if not found. */
    bool open (const std::string& name, Mode mode)
    {
        close();
        name_ = name;
        mode_ = mode;
#if __APPLE__ || __linux__
        const int flags = (mode == Mode::Owner) ? (O_CREAT | O_EXCL) : 0;
        sem_ = sem_open (name.c_str(), flags, 0600, 0);
        if (sem_ == SEM_FAILED)
        {
            // On failure, drop the recorded name so close() does not try to unlink.
            name_.clear();
            return false;
        }
        return true;
#elif _WIN32
        const auto wname = juce::String (name).toWideCharPointer();
        if (mode == Mode::Owner)
            sem_ = CreateEventW (nullptr, FALSE, FALSE, wname);
        else
            sem_ = OpenEventW (EVENT_ALL_ACCESS, FALSE, wname);

        if (sem_ == nullptr)
        {
            name_.clear();
            return false;
        }
        return true;
#endif
    }

    /** Close the semaphore.
        Owner: closes FD AND unlinks the filesystem entry (kernel object persists
        until any remaining FDs across all processes are closed).
        Attacher: closes FD only. */
    void close() noexcept
    {
#if __APPLE__ || __linux__
        if (sem_ != SEM_FAILED && sem_ != nullptr)
        {
            sem_close (sem_);
            sem_ = SEM_FAILED;
        }
        if (mode_ == Mode::Owner && ! name_.empty())
        {
            sem_unlink (name_.c_str());
        }
#elif _WIN32
        if (sem_ != nullptr)
        {
            CloseHandle (sem_);
            sem_ = nullptr;
        }
#endif
        name_.clear();
    }

    /** Signal the semaphore. RT-safe, kernel-only, never blocks user-space.
        Returns true on success. Returns false if not opened. */
    bool post() noexcept
    {
#if __APPLE__ || __linux__
        if (sem_ == SEM_FAILED || sem_ == nullptr)
            return false;
        return sem_post (sem_) == 0;
#elif _WIN32
        if (sem_ == nullptr)
            return false;
        return SetEvent (sem_) != 0;
#endif
    }

    /** Wait with a bounded timeout.
        @param timeoutMicroseconds Maximum time to wait in microseconds.
        @return true if the semaphore was signaled, false on timeout or error. */
    bool timedWait (uint64_t timeoutMicroseconds) noexcept
    {
#if __linux__
        if (sem_ == SEM_FAILED || sem_ == nullptr)
            return false;

        struct timespec abs;
        clock_gettime (CLOCK_REALTIME, &abs);

        const uint64_t nsec = static_cast<uint64_t> (abs.tv_nsec) + (timeoutMicroseconds * 1000ULL);
        abs.tv_sec += static_cast<time_t> (nsec / 1000000000ULL);
        abs.tv_nsec = static_cast<long> (nsec % 1000000000ULL);

        for (;;)
        {
            const int r = sem_timedwait (sem_, &abs);
            if (r == 0)
                return true;
            if (errno == EINTR)
                continue;
            return false;  // ETIMEDOUT or error
        }
#elif __APPLE__
        // macOS: sem_timedwait does not exist for named semaphores. Poll sem_trywait
        // with a 50 µs granularity until the deadline. Latency budget is dominated
        // by the audio-thread spin phase (~390 µs in _mm_pause loop) so this is fine.
        if (sem_ == SEM_FAILED || sem_ == nullptr)
            return false;

        const auto deadline = std::chrono::steady_clock::now()
                            + std::chrono::microseconds (timeoutMicroseconds);
        for (;;)
        {
            if (sem_trywait (sem_) == 0)
                return true;
            if (errno != EAGAIN)
                return false;
            if (std::chrono::steady_clock::now() >= deadline)
                return false;
            usleep (50);
        }
#elif _WIN32
        if (sem_ == nullptr)
            return false;
        DWORD ms = static_cast<DWORD> (timeoutMicroseconds / 1000ULL);
        if (ms == 0 && timeoutMicroseconds > 0)
            ms = 1;
        return WaitForSingleObject (sem_, ms) == WAIT_OBJECT_0;
#endif
    }

    /** Blocking wait. For non-RT threads only (e.g., worker's RT thread shutdown). */
    void wait() noexcept
    {
#if __APPLE__ || __linux__
        if (sem_ == SEM_FAILED || sem_ == nullptr)
            return;
        while (sem_wait (sem_) != 0 && errno == EINTR)
        {
        }
#elif _WIN32
        if (sem_ != nullptr)
            WaitForSingleObject (sem_, INFINITE);
#endif
    }

    /** True if open() succeeded and the semaphore is usable. */
    bool isOpen() const noexcept
    {
#if __APPLE__ || __linux__
        return sem_ != SEM_FAILED && sem_ != nullptr;
#elif _WIN32
        return sem_ != nullptr;
#endif
    }

    /** Currently bound name, or empty string if not open. */
    const std::string& getName() const noexcept { return name_; }

    //==========================================================================
    /** Generate a unique semaphore name following the project convention.
        Format: `/els_<pid>_<counter>_<suffix>` (≤ 21 chars including '/').
        Each call increments an internal counter so callers can request several
        names in succession without collisions. */
    static std::string generateName (char suffix)
    {
        static std::atomic<uint32_t> counter { 0 };
        const uint32_t c = counter.fetch_add (1, std::memory_order_relaxed);

#if __APPLE__ || __linux__
        const auto pid = static_cast<long> (::getpid());
#elif _WIN32
        const auto pid = static_cast<long> (GetCurrentProcessId());
#endif

        std::string out;
        out.reserve (24);
        out.push_back ('/');
        out.append ("els_");
        out.append (std::to_string (pid));
        out.push_back ('_');
        out.append (std::to_string (c));
        out.push_back ('_');
        out.push_back (suffix);
        return out;
    }

private:
#if __APPLE__ || __linux__
    sem_t* sem_ { SEM_FAILED };
#elif _WIN32
    HANDLE sem_ { nullptr };
#endif
    std::string name_;
    Mode mode_ { Mode::Owner };
};

} // namespace element
