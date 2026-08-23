// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <memory>

#include <element/datapath.hpp>

namespace element {

/** Process-wide verbose logger that writes to a dedicated file independent
    of Context lifecycle (so it works during plugin ctor/dtor, sandbox
    worker startup, and other times where the Element Log via Context
    is not available).

    Output: ~/Library/Application Support/Element/log/element-verbose.log
            (or the equivalent applicationDataDir on Linux/Windows).

    Verbose (V) lines are gated by the env var ELEMENT_VERBOSE=1. INFO,
    WARN and ERR lines are always written. */
class VerboseLog
{
public:
    static VerboseLog& instance();

    void log (const juce::String& category,
              const juce::String& level,
              const juce::String& msg);

    bool isVerbose() const noexcept { return verboseFlag.load (std::memory_order_relaxed); }
    void setVerbose (bool v) noexcept { verboseFlag.store (v, std::memory_order_relaxed); }

    juce::File getLogFile() const;

private:
    VerboseLog();

    juce::CriticalSection lock;
    std::unique_ptr<juce::FileLogger> file;
    std::atomic<bool> verboseFlag { false };
};

} // namespace element

// Always-on lifecycle / error logging. Each call is one timestamped line.
//   category: short tag, e.g. "AU", "GFX", "SANDBOX"
//   msg:      stream-style expression, e.g. "x=" << x << " y=" << y
#define EL_LOG(category, msg)                                                       \
    do {                                                                            \
        juce::String _el_log_buf;                                                   \
        _el_log_buf << msg;                                                         \
        ::element::VerboseLog::instance().log (category, "INFO", _el_log_buf);      \
    } while (0)

#define EL_LOG_WARN(category, msg)                                                  \
    do {                                                                            \
        juce::String _el_log_buf;                                                   \
        _el_log_buf << msg;                                                         \
        ::element::VerboseLog::instance().log (category, "WARN", _el_log_buf);      \
    } while (0)

#define EL_LOG_ERR(category, msg)                                                   \
    do {                                                                            \
        juce::String _el_log_buf;                                                   \
        _el_log_buf << msg;                                                         \
        ::element::VerboseLog::instance().log (category, "ERR ", _el_log_buf);      \
    } while (0)

// Verbose: only emitted when ELEMENT_VERBOSE=1 (env) or setVerbose(true).
#define EL_LOG_V(category, msg)                                                     \
    do {                                                                            \
        if (::element::VerboseLog::instance().isVerbose()) {                        \
            juce::String _el_log_buf;                                               \
            _el_log_buf << msg;                                                     \
            ::element::VerboseLog::instance().log (category, "VERB", _el_log_buf);  \
        }                                                                           \
    } while (0)

// Convenience: log this thread is/isn't the JUCE message thread.
#define EL_LOG_THREAD(category, msg)                                                \
    do {                                                                            \
        const bool _el_mt = juce::MessageManager::getInstance() != nullptr          \
                            && juce::MessageManager::getInstance()                  \
                                  ->isThisTheMessageThread();                       \
        juce::String _el_log_buf;                                                   \
        _el_log_buf << msg << " thread=" << (_el_mt ? "MSG" : "OTHER");             \
        ::element::VerboseLog::instance().log (category, "INFO", _el_log_buf);      \
    } while (0)
