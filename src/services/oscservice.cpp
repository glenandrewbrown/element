// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/juce/osc.hpp>

#include <element/ui/commands.hpp>

#include <element/context.hpp>
#include <element/devices.hpp>
#include <element/settings.hpp>

#include "services/oscservice.hpp"

#define EL_OSC_ADDRESS_COMMAND "/element/command"
#define EL_OSC_ADDRESS_ENGINE "/element/engine"

using namespace juce;

namespace element {

struct CommandOSCListener final : juce::OSCReceiver::ListenerWithOSCAddress<>
{
    CommandOSCListener (Context& w)
        : world (w)
    {
    }

    void oscMessageReceived (const juce::OSCMessage& message) override
    {
        const auto msg = message[0];
        if (! msg.isString())
            return;

        const auto command = Commands::fromString (msg.getString());
        if (command != Commands::invalid)
        {
            // noop
        }
    }

private:
    [[maybe_unused]] Context& world;
};

//=============================================================================
struct EngineOSCListener final : OSCReceiver::ListenerWithOSCAddress<>
{
    EngineOSCListener (Context& g)
        : globals (g)
    {
    }

    void oscMessageReceived (const juce::OSCMessage& message) override
    {
        const auto slug = message[0];
        if (! slug.isString())
            return;

        if (message.size() >= 2 && slug.getString().toLowerCase().trim() == "samplerate")
            handleSampleRate (message[1]);
    }

private:
    Context& globals;

    void handleSampleRate (const OSCArgument& arg)
    {
        double sampleRate = 0.0;
        switch (arg.getType())
        {
            // see juce_OSCTypes.cpp for other types
            case 'i':
                sampleRate = (double) arg.getInt32();
                break;
            case 'f':
                sampleRate = (double) roundToInt (arg.getFloat32());
                break;
            default:
                break;
        }

        if (sampleRate <= 0.0)
            return;

        auto& devs = globals.devices();
        auto setup = devs.getAudioDeviceSetup();
        if (sampleRate != setup.sampleRate)
        {
            setup.sampleRate = sampleRate;
            devs.setAudioDeviceSetup (setup, true);
        }
    }
};

//=============================================================================
class OSCService::Impl : private juce::Timer
{
public:
    Impl (OSCService& o)
        : owner (o) {}

    ~Impl()
    {
        stopTimer();
    }

    bool startServer()
    {
        if (isServing())
            return true;
        serving = receiver.connect (serverPort);
        if (! serving)
            DBG ("OSCService: failed to bind receiver on port " << serverPort);
        return serving;
    }

    bool stopServer()
    {
        if (! isServing())
            return true;
        const auto result = receiver.disconnect();
        if (result)
            serving = false;
        return result;
    }

    bool isServing() const { return serving; }

    void setServerPort (int newPort)
    {
        if (newPort == serverPort)
            return;
        const auto wasServing = isServing();
        stopServer();
        serverPort = newPort;
        if (wasServing)
            startServer();
    }

    //=========================================================================
    // Sender API

    bool connectSender (const juce::String& host, int port)
    {
        disconnectSender();
        senderConnected = sender.connect (host, port);
        if (senderConnected)
        {
            senderHost = host;
            senderPort = port;
            consecutiveFailures = 0;
            firstFailureTime = 0;
        }
        else
        {
            DBG ("OSCService: sender failed to connect to " << host << ":" << port);
        }
        return senderConnected;
    }

    void disconnectSender()
    {
        stopTimer();
        if (senderConnected)
        {
            sender.disconnect();
            senderConnected = false;
        }
        consecutiveFailures = 0;
        firstFailureTime = 0;
    }

    bool isSenderConnected() const noexcept { return senderConnected; }

    bool sendMessage (const juce::OSCMessage& msg)
    {
        if (! senderConnected)
            return false;

        if (sender.send (msg))
        {
            consecutiveFailures = 0;
            firstFailureTime = 0;
            return true;
        }

        const auto now = juce::Time::currentTimeMillis();
        if (consecutiveFailures == 0)
            firstFailureTime = now;

        ++consecutiveFailures;
        DBG ("OSCService: send failure #" << consecutiveFailures);

        constexpr int kMaxConsecutiveFailures = 3;
        constexpr int kFailureWindowMs = 5000;
        if (consecutiveFailures >= kMaxConsecutiveFailures
            && (now - firstFailureTime) <= kFailureWindowMs
            && ! isTimerRunning())
        {
            DBG ("OSCService: scheduling sender reconnect in 2s");
            startTimer (2000);
        }

        return false;
    }

    //=========================================================================
    void initialize()
    {
        if (listenersReady == true)
            return;

        application.reset (new CommandOSCListener (owner.context()));
        receiver.addListener (application.get(), EL_OSC_ADDRESS_COMMAND);

        engine.reset (new EngineOSCListener (owner.context()));
        receiver.addListener (engine.get(), EL_OSC_ADDRESS_ENGINE);

        listenersReady = true;
    }

    void shutdown()
    {
        if (! listenersReady)
            return;
        listenersReady = false;

        receiver.removeListener (application.get());
        receiver.removeListener (engine.get());

        application.reset();
        engine.reset();
    }

    int getHostPort() const { return serverPort; }

private:
    void timerCallback() override
    {
        stopTimer();
        if (senderConnected || senderHost.isEmpty())
            return;
        DBG ("OSCService: attempting sender reconnect to " << senderHost << ":" << senderPort);
        connectSender (senderHost, senderPort);
    }

    OSCService& owner;
    juce::OSCSender sender;
    juce::OSCReceiver receiver { "elosc" };

    bool listenersReady = false;
    bool serving { false };
    int serverPort { 9000 };

    bool senderConnected { false };
    juce::String senderHost;
    int senderPort { 0 };
    int consecutiveFailures { 0 };
    juce::int64 firstFailureTime { 0 };

    std::unique_ptr<CommandOSCListener> application;
    std::unique_ptr<EngineOSCListener> engine;
};

//=============================================================================

OSCService::OSCService()
{
    impl.reset (new Impl (*this));
}

OSCService::~OSCService()
{
    impl.reset();
}

void OSCService::refreshWithSettings (bool alertOnFail)
{
    auto& settings = context().settings();
    impl->stopServer();
    impl->setServerPort (settings.getOscHostPort());

    if (settings.isOscHostEnabled())
    {
        if (! impl->startServer() && alertOnFail)
        {
            String msg = "Could not start OSC host on port ";
            msg << impl->getHostPort();
            AlertWindow::showMessageBoxAsync (AlertWindow::WarningIcon,
                                              "OSC Host",
                                              msg);
        }
    }
}

bool OSCService::connectSender (const juce::String& host, int port)
{
    return impl->connectSender (host, port);
}

void OSCService::disconnectSender()
{
    impl->disconnectSender();
}

bool OSCService::isSenderConnected() const noexcept
{
    return impl->isSenderConnected();
}

bool OSCService::sendMessage (const juce::OSCMessage& msg)
{
    return impl->sendMessage (msg);
}

void OSCService::activate()
{
    impl->initialize();
    refreshWithSettings (false);
}

void OSCService::deactivate()
{
    impl->stopServer();
    impl->shutdown();
    impl->disconnectSender();
}

} // namespace element
