// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#define BOOST_TEST_MODULE Element
#define BOOST_TEST_NO_MAIN
#define BOOST_TEST_ALTERNATIVE_INIT_API
#include <boost/test/included/unit_test.hpp>
#include <element/juce.hpp>
using namespace juce;

#include "engine/sandboxworker.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/sandboxsemaphore.hpp"
#include "engine/sandboxsharedmemory.hpp"

#include <unistd.h>

#include <element/context.hpp>
#include <element/services.hpp>

namespace element {
namespace test {
static std::unique_ptr<Context> _context;
Context* context()
{
    if (_context == nullptr) {
        _context = std::make_unique<Context> (RunMode::Standalone);
        _context->services().initialize();
        _context->services().activate();
    }
    return _context.get();
}

void resetContext()
{
    _context.reset();
}
} // namespace test
} // namespace element

struct JuceMessageManagerFixture {
    JuceMessageManagerFixture()
    {
        MessageManager::getInstance();
        juce::initialiseJuce_GUI();
    }

    ~JuceMessageManagerFixture()
    {
        element::test::resetContext();
        juce::shutdownJuce_GUI();
    }
};

BOOST_GLOBAL_FIXTURE (JuceMessageManagerFixture);

BOOST_AUTO_TEST_SUITE (Element)

BOOST_AUTO_TEST_CASE (Sanity)
{
    BOOST_TEST_REQUIRE (2 + 2 != 5);
}

BOOST_AUTO_TEST_SUITE_END()

int main (int argc, char* argv[])
{
    // Sandbox-worker dispatch: when this test binary is re-execed by a
    // SandboxHost (or its test stand-in) with the EL_PLUGIN_HOST_PROCESS_ID
    // tag in argv[1], hand off to SandboxWorker and never run Boost.Test.
    //
    // Production parity: Application::maybeLaunchSandboxWorker (src/application.cpp:441)
    // does the equivalent for the production element_app binary.
    // D-2 cross-process semaphore test mode.
    // Worker: open trig+done semaphores as Attacher, wait on trig (100 ms timeout),
    // post done if signaled (exit 0) or exit 13 on timeout. Parent (test) is in
    // SandboxSemaphoreCrossProcessTest.cpp.
    if (argc >= 4 && juce::String (argv[1]) == "--d2-sem-test")
    {
        const std::string trigName = argv[2];
        const std::string doneName = argv[3];

        element::SandboxSemaphore trig;
        element::SandboxSemaphore done;
        if (! trig.open (trigName, element::SandboxSemaphore::Mode::Attacher))
            return 91;
        if (! done.open (doneName, element::SandboxSemaphore::Mode::Attacher))
            return 92;

        if (! trig.timedWait (100000)) // 100 ms
            return 13;

        done.post();
        return 0;
    }

    if (argc >= 3 && juce::String (argv[1]) == "--d1-readback-test")
    {
        juce::ScopedJuceInitialiser_GUI juceInit;
        const std::string shmName = argv[2];

        const size_t total = element::SharedAudioBuffer::calculateRequiredSize (2, 256);
        element::SandboxSharedMemory shm;
        if (! shm.attach (shmName, total))
            return 91;

        element::SharedAudioBuffer worker;
        if (! worker.attachToMemoryAsAttacher (
                static_cast<uint8_t*> (shm.getData()),
                shm.getSize(),
                2, 256))
            return 92;

        auto* header = worker.getHeader();
        if (header == nullptr)
            return 93;

        const uint32_t value = __atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE);
        __atomic_store_n (&header->workerSequence, value, __ATOMIC_RELEASE);
        return 0;
    }

    if (argc >= 2)
    {
        const juce::String commandLine (argv[1]);
        if (commandLine.contains (EL_PLUGIN_HOST_PROCESS_ID))
        {
            {
                const auto pidStr = juce::String (static_cast<int> (::getpid()));
                juce::File startupLog ("/tmp/element-sandbox-worker-" + pidStr + ".startup.log");
                startupLog.replaceWithText (
                    "[startup] argc=" + juce::String (argc)
                    + " pid=" + pidStr
                    + " cmdline=" + commandLine + "\n");
            }

            juce::ScopedJuceInitialiser_GUI juceInit;

            element::SandboxWorker worker;
            if (worker.initialise (commandLine))
            {
                auto* mm = juce::MessageManager::getInstance();
                while (! mm->hasStopMessageBeenSent())
                    mm->runDispatchLoopUntil (50);
                return 0;
            }
            return 1;
        }
    }

    // Normal test-run path: delegate to Boost.Test's runner.
    return ::boost::unit_test::unit_test_main (
        []() { return true; }, argc, argv);
}
