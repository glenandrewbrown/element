// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

#if __APPLE__ || __linux__
 #include <fcntl.h>
 #include <sys/mman.h>
 #include <sys/stat.h>
 #include <unistd.h>
#elif _WIN32
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#endif

namespace element {

//==============================================================================
/**
 * Cross-platform shared memory region for sandbox IPC.
 *
 * Provides OS-level shared memory that is visible across process boundaries.
 * The host process creates the region, and the worker process attaches to
 * it by name.
 *
 *   - macOS/Linux: shm_open + mmap (POSIX shared memory)
 *   - Windows: CreateFileMappingW + MapViewOfFile
 *
 * The creator (host) is responsible for unlinking the region on close.
 */
class SandboxSharedMemory
{
public:
    SandboxSharedMemory() = default;

    ~SandboxSharedMemory()
    {
        close();
    }

    // Non-copyable
    SandboxSharedMemory (const SandboxSharedMemory&) = delete;
    SandboxSharedMemory& operator= (const SandboxSharedMemory&) = delete;

    // Move-constructible
    SandboxSharedMemory (SandboxSharedMemory&& other) noexcept
        : data (other.data),
          size (other.size),
          isOwner (other.isOwner),
          name (std::move (other.name))
#if _WIN32
        , hMapping (other.hMapping)
#endif
    {
        other.data = nullptr;
        other.size = 0;
        other.isOwner = false;
#if _WIN32
        other.hMapping = nullptr;
#endif
    }

    SandboxSharedMemory& operator= (SandboxSharedMemory&& other) noexcept
    {
        if (this != &other)
        {
            close();
            data = other.data;
            size = other.size;
            isOwner = other.isOwner;
            name = std::move (other.name);
#if _WIN32
            hMapping = other.hMapping;
            other.hMapping = nullptr;
#endif
            other.data = nullptr;
            other.size = 0;
            other.isOwner = false;
        }
        return *this;
    }

    /**
     * Create a new shared memory region (host side).
     * @param shmName   Name for the region. On POSIX, must start with '/'.
     * @param sizeBytes Total size in bytes.
     * @return true on success.
     */
    bool create (const std::string& shmName, size_t sizeBytes)
    {
        close();
        name = shmName;
        size = sizeBytes;
        isOwner = true;

#if __APPLE__ || __linux__
        int fd = shm_open (name.c_str(), O_CREAT | O_RDWR, 0600);
        if (fd < 0)
            return false;

        if (ftruncate (fd, static_cast<off_t> (sizeBytes)) != 0)
        {
            ::close (fd);
            shm_unlink (name.c_str());
            return false;
        }

        void* ptr = mmap (nullptr, sizeBytes, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        ::close (fd);

        if (ptr == MAP_FAILED)
        {
            shm_unlink (name.c_str());
            return false;
        }

        data = static_cast<uint8_t*> (ptr);
        return true;

#elif _WIN32
        // Convert name to wide string (skip leading '/' if present)
        std::string winName = shmName;
        if (! winName.empty() && winName[0] == '/')
            winName = winName.substr (1);

        // Replace remaining '/' with '_' for Windows compatibility
        for (auto& ch : winName)
            if (ch == '/')
                ch = '_';

        int wideLen = MultiByteToWideChar (CP_UTF8, 0, winName.c_str(), -1, nullptr, 0);
        std::wstring wideName (static_cast<size_t> (wideLen), L'\0');
        MultiByteToWideChar (CP_UTF8, 0, winName.c_str(), -1, wideName.data(), wideLen);

        DWORD highSize = static_cast<DWORD> ((static_cast<uint64_t> (sizeBytes) >> 32) & 0xFFFFFFFF);
        DWORD lowSize = static_cast<DWORD> (sizeBytes & 0xFFFFFFFF);

        hMapping = CreateFileMappingW (INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                       highSize, lowSize, wideName.c_str());
        if (hMapping == nullptr)
            return false;

        void* ptr = MapViewOfFile (hMapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeBytes);
        if (ptr == nullptr)
        {
            CloseHandle (hMapping);
            hMapping = nullptr;
            return false;
        }

        data = static_cast<uint8_t*> (ptr);
        return true;
#else
        return false;
#endif
    }

    /**
     * Attach to an existing shared memory region (worker side).
     * @param shmName   Name of the existing region.
     * @param sizeBytes Expected size in bytes.
     * @return true on success.
     */
    bool attach (const std::string& shmName, size_t sizeBytes)
    {
        close();
        name = shmName;
        size = sizeBytes;
        isOwner = false;

#if __APPLE__ || __linux__
        int fd = shm_open (name.c_str(), O_RDWR, 0600);
        if (fd < 0)
            return false;

        void* ptr = mmap (nullptr, sizeBytes, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
        ::close (fd);

        if (ptr == MAP_FAILED)
            return false;

        data = static_cast<uint8_t*> (ptr);
        return true;

#elif _WIN32
        std::string winName = shmName;
        if (! winName.empty() && winName[0] == '/')
            winName = winName.substr (1);

        for (auto& ch : winName)
            if (ch == '/')
                ch = '_';

        int wideLen = MultiByteToWideChar (CP_UTF8, 0, winName.c_str(), -1, nullptr, 0);
        std::wstring wideName (static_cast<size_t> (wideLen), L'\0');
        MultiByteToWideChar (CP_UTF8, 0, winName.c_str(), -1, wideName.data(), wideLen);

        hMapping = OpenFileMappingW (FILE_MAP_ALL_ACCESS, FALSE, wideName.c_str());
        if (hMapping == nullptr)
            return false;

        void* ptr = MapViewOfFile (hMapping, FILE_MAP_ALL_ACCESS, 0, 0, sizeBytes);
        if (ptr == nullptr)
        {
            CloseHandle (hMapping);
            hMapping = nullptr;
            return false;
        }

        data = static_cast<uint8_t*> (ptr);
        return true;
#else
        return false;
#endif
    }

    /** Unmap and, if owner, unlink the shared memory region. */
    void close()
    {
        if (data == nullptr)
            return;

#if __APPLE__ || __linux__
        munmap (data, size);
        if (isOwner && ! name.empty())
            shm_unlink (name.c_str());
#elif _WIN32
        UnmapViewOfFile (data);
        if (hMapping != nullptr)
        {
            CloseHandle (hMapping);
            hMapping = nullptr;
        }
#endif

        data = nullptr;
        size = 0;
        name.clear();
        isOwner = false;
    }

    /** Get a pointer to the mapped region. nullptr if not mapped. */
    uint8_t* getData() { return data; }
    const uint8_t* getData() const { return data; }

    /** Get the size of the mapped region in bytes. */
    size_t getSize() const { return size; }

    /** Get the shared memory name. */
    const std::string& getName() const { return name; }

    /** Check if this instance owns (created) the region. */
    bool isCreator() const { return isOwner; }

    /** Check if shared memory is currently mapped. */
    bool isMapped() const { return data != nullptr; }

    /**
     * Generate a unique shared memory name for a sandbox instance.
     * Format: /el_sb_<pid>_<counter>
     */
    static std::string generateName()
    {
        static std::atomic<uint32_t> counter { 0 };
        auto pid = static_cast<uint32_t> (
#if _WIN32
            GetCurrentProcessId()
#else
            getpid()
#endif
        );
        return "/el_sb_" + std::to_string (pid) + "_" + std::to_string (counter.fetch_add (1));
    }

private:
    uint8_t* data { nullptr };
    size_t size { 0 };
    bool isOwner { false };
    std::string name;

#if _WIN32
    HANDLE hMapping { nullptr };
#endif
};

} // namespace element
