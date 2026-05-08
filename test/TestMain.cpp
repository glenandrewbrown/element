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
    if (argc >= 2)
    {
        const juce::String commandLine (argv[1]);
        if (commandLine.contains (EL_PLUGIN_HOST_PROCESS_ID))
        {
            // ScopedJuceInitialiser_GUI initialises the MessageManager that
            // SandboxWorker's juce::Timer base class needs. RAII teardown.
            juce::ScopedJuceInitialiser_GUI juceInit;

            element::SandboxWorker worker;
            if (worker.initialise (commandLine))
            {
                juce::MessageManager::getInstance()->runDispatchLoop();
                return 0;
            }
            // initialise() returned false: either the tag was a coincidence,
            // or the parent PID is dead. Exit non-zero without running tests.
            return 1;
        }
    }

    // Normal test-run path: delegate to Boost.Test's runner.
    return ::boost::unit_test::unit_test_main (
        []() { return true; }, argc, argv);
}
