// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include "verbose_log.hpp"

#include <cstdlib>
#include <unistd.h>

namespace element {

VerboseLog& VerboseLog::instance()
{
    static VerboseLog v;
    return v;
}

juce::File VerboseLog::getLogFile() const
{
    return DataPath::applicationDataDir()
        .getChildFile ("log")
        .getChildFile ("element-verbose.log");
}

VerboseLog::VerboseLog()
{
    auto logFile = getLogFile();
    logFile.getParentDirectory().createDirectory();

    if (auto* env = std::getenv ("ELEMENT_VERBOSE"))
        verboseFlag.store (juce::String (env).trim().getIntValue() > 0,
                           std::memory_order_relaxed);

    // Cap individual log files at ~5 MiB so a runaway daw doesn't fill disk.
    const auto welcome = juce::String ("=== Element verbose log opened pid=")
                       + juce::String ((juce::int64) ::getpid())
                       + " verbose=" + (isVerbose() ? "1" : "0") + " ===";

    file = std::make_unique<juce::FileLogger> (logFile, welcome, 5 * 1024 * 1024);
}

void VerboseLog::log (const juce::String& category,
                      const juce::String& level,
                      const juce::String& msg)
{
    if (file == nullptr)
        return;

    // Timestamp with millisecond precision so concurrent thread interleaving
    // is observable in the log file.
    const auto now = juce::Time::getCurrentTime();
    juce::String ts;
    ts << now.formatted ("%Y-%m-%d %H:%M:%S.")
       << juce::String (now.getMilliseconds()).paddedLeft ('0', 3);

    juce::String line;
    line << ts << " [" << level << "] [" << category << "] " << msg;

    juce::ScopedLock sl (lock);
    file->logMessage (line);
}

} // namespace element
