// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <cstdint>

#if __APPLE__
 #include <mach/mach.h>
#elif __linux__
 #include <semaphore.h>
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
 * Cross-platform semaphore for RT-safe audio IPC signaling.
 *
 * Uses the most efficient native primitive on each platform:
 *   - macOS: Mach semaphores (kernel-level, no name collisions)
 *   - Linux: POSIX unnamed semaphores (process-local, no /dev/shm)
 *   - Windows: Auto-reset Events (lightweight kernel object)
 *
 * post() is RT-safe and never blocks. timedWait() provides bounded
 * waits suitable for audio deadline enforcement.
 */
class SandboxSemaphore
{
public:
    SandboxSemaphore()
    {
#if __APPLE__
        semaphore_create (mach_task_self(), &sem, SYNC_POLICY_FIFO, 0);
#elif __linux__
        sem_init (&sem, 0, 0);
#elif _WIN32
        sem = CreateEventW (nullptr, FALSE, FALSE, nullptr);
#endif
    }

    ~SandboxSemaphore()
    {
#if __APPLE__
        semaphore_destroy (mach_task_self(), sem);
#elif __linux__
        sem_destroy (&sem);
#elif _WIN32
        if (sem != nullptr)
            CloseHandle (sem);
#endif
    }

    // Non-copyable
    SandboxSemaphore (const SandboxSemaphore&) = delete;
    SandboxSemaphore& operator= (const SandboxSemaphore&) = delete;

    /** Signal the semaphore. RT-safe, never blocks. */
    void post()
    {
#if __APPLE__
        semaphore_signal (sem);
#elif __linux__
        sem_post (&sem);
#elif _WIN32
        SetEvent (sem);
#endif
    }

    /**
     * Wait with a bounded timeout.
     * @param timeoutMicroseconds  Maximum time to wait in microseconds.
     * @return true if signaled, false if timed out.
     */
    bool timedWait (uint64_t timeoutMicroseconds)
    {
#if __APPLE__
        mach_timespec_t ts;
        ts.tv_sec = static_cast<unsigned int> (timeoutMicroseconds / 1000000ULL);
        ts.tv_nsec = static_cast<clock_res_t> ((timeoutMicroseconds % 1000000ULL) * 1000ULL);
        kern_return_t kr = semaphore_timedwait (sem, ts);
        return kr == KERN_SUCCESS;
#elif __linux__
        struct timespec abs;
        clock_gettime (CLOCK_REALTIME, &abs);

        uint64_t nsec = static_cast<uint64_t> (abs.tv_nsec) + (timeoutMicroseconds * 1000ULL);
        abs.tv_sec += static_cast<time_t> (nsec / 1000000000ULL);
        abs.tv_nsec = static_cast<long> (nsec % 1000000000ULL);

        while (true)
        {
            int r = sem_timedwait (&sem, &abs);
            if (r == 0)
                return true;
            if (errno == EINTR)
                continue;
            return false; // ETIMEDOUT or error
        }
#elif _WIN32
        DWORD ms = static_cast<DWORD> (timeoutMicroseconds / 1000ULL);
        if (ms == 0 && timeoutMicroseconds > 0)
            ms = 1;
        return WaitForSingleObject (sem, ms) == WAIT_OBJECT_0;
#endif
    }

    /** Blocking wait. For non-RT threads only. */
    void wait()
    {
#if __APPLE__
        semaphore_wait (sem);
#elif __linux__
        while (sem_wait (&sem) != 0 && errno == EINTR)
        {
        }
#elif _WIN32
        WaitForSingleObject (sem, INFINITE);
#endif
    }

private:
#if __APPLE__
    semaphore_t sem {};
#elif __linux__
    sem_t sem {};
#elif _WIN32
    HANDLE sem { nullptr };
#endif
};

} // namespace element
