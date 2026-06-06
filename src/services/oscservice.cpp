// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/juce/osc.hpp>

#include <element/ui/commands.hpp>

#include <element/context.hpp>
#include <element/devices.hpp>
#include <element/services.hpp>
#include <element/settings.hpp>
#include <element/ui.hpp>

#include "services/oscservice.hpp"

#define EL_OSC_ADDRESS_COMMAND "/element/command"
#define EL_OSC_ADDRESS_ENGINE "/element/engine"
#define EL_OSC_ADDRESS_QUERY "/element/query"

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
        // A command may arrive two ways:
        //   1. /element/command/<name>            (name carried in the address)
        //   2. /element/command  "<name>"         (name as the first string arg)
        // Callbacks are delivered on the message thread (MessageLoopCallback,
        // the default for ListenerWithOSCAddress<>), so invoking the command
        // manager directly here is thread-safe.
        auto command = commandFromAddress (message.getAddressPattern());

        if (command == Commands::invalid && message.size() > 0 && message[0].isString())
            command = Commands::fromString (message[0].getString());

        if (command == Commands::invalid)
            return;

        if (auto* gui = world.services().find<GuiService>())
            gui->commands().invokeDirectly (command, true);
    }

private:
    /** Maps an incoming "/element/command/<name>" address to a CommandID.
        Returns Commands::invalid for the bare "/element/command" address or
        any unrecognised name.
    */
    static juce::CommandID commandFromAddress (const juce::OSCAddressPattern& pattern)
    {
        const juce::String prefix = juce::String (EL_OSC_ADDRESS_COMMAND) + "/";
        const auto addr = pattern.toString();
        if (! addr.startsWith (prefix))
            return Commands::invalid;
        return Commands::fromString (addr.substring (prefix.length()).trim());
    }

    Context& world;
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
/** QA/flow-debug query surface (logic-routing plan W2).

    "/element/query dumpcv [path]" — walk the active graph and write every
    node's CV-output latches as JSON:
      { "<nodeUuid>": { "name": "...", "cv": [v0, v1, ...] }, ... }
    Default path: the system temp dir + "element-cvdump.json". Gives
    cli-anything-element a scriptable LIVE assertion that CV actually flows
    in the installed app (the non-fallback-able Wave-5 verification gate).
*/
struct QueryOSCListener final : OSCReceiver::ListenerWithOSCAddress<>
{
    QueryOSCListener (Context& g) : globals (g) {}

    void oscMessageReceived (const juce::OSCMessage& message) override
    {
        if (message.size() < 1 || ! message[0].isString())
            return;
        const auto slug = message[0].getString().toLowerCase().trim();
        if (slug != "dumpcv")
            return;

        juce::File out = juce::File::getSpecialLocation (juce::File::tempDirectory)
                             .getChildFile ("element-cvdump.json");
        if (message.size() >= 2 && message[1].isString())
        {
            const auto p = message[1].getString().trim();
            if (p.isNotEmpty())
                out = juce::File (p);
        }

        writeDump (out);
    }

private:
    Context& globals;

    void writeDump (const juce::File& out)
    {
        DynamicObject::Ptr root (new DynamicObject());
        auto sess = globals.session();
        if (sess != nullptr)
        {
            const Graph G (sess->getActiveGraph());
            for (int i = 0; i < G.getNumNodes(); ++i)
            {
                const Node n (G.getNode (i));
                auto* proc = n.getObject();
                if (proc == nullptr)
                    continue;

                const int numCv = proc->getNumOutputCVChannels();
                if (numCv <= 0)
                    continue;

                Array<var> values;
                for (int c = 0; c < numCv; ++c)
                    values.add (var (proc->getOutputCV (c)));

                DynamicObject::Ptr row (new DynamicObject());
                row->setProperty ("name", n.getName());
                row->setProperty ("cv", var (values));
                root->setProperty (n.getUuidString(), var (row.get()));
            }
        }

        out.replaceWithText (JSON::toString (var (root.get())));
        Logger::writeToLog ("OSCService: dumpcv -> " + out.getFullPathName());
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

        query.reset (new QueryOSCListener (owner.context()));
        receiver.addListener (query.get(), EL_OSC_ADDRESS_QUERY);

        // Per-command addresses: /element/command/<name> for every command
        // (e.g. /element/command/transportPlay).  One listener, many addresses.
        for (const auto& addy : Commands::getOSCAddresses())
            receiver.addListener (application.get(), juce::OSCAddress (addy));

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
        receiver.removeListener (query.get());
        receiver.removeListener (engine.get());

        application.reset();
        query.reset();
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
    std::unique_ptr<QueryOSCListener> query;
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
