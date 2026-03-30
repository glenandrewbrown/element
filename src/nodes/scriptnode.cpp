// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <math.h>

#include <element/midipipe.hpp>
#include <element/parameter.hpp>

#include "luascripts.hpp"

#include "sol/sol.hpp"
#include "element/element.h"
#include "el/factories.hpp"
#include "engine/graphnode.hpp"
#include "nodes/scriptnode.hpp"
#include "scripting/bindings.hpp"
#include "scripting/dspscript.hpp"
#include "scripting/scriptloader.hpp"
#include "scripting/scriptmanager.hpp"

#define EL_LUA_DBG(x)
// #define EL_LUA_DBG(x) DBG(x)

static const juce::String initScript =
    R"(
require ('el.AudioBuffer')
require ('el.MidiBuffer')
require ('el.MidiMessage')
require ('el.midi')
require ('el.audio')
require ('el.MidiPipe')
)";

namespace element {

//=============================================================================
ScriptNode::ScriptNode() noexcept
    : Processor (0)
{
    setName ("Script");
    Lua::initializeState (lua);

    lua.set_function ("print", [this] (sol::variadic_args va) {
        auto& e = lua;
        String msg;
        for (auto v : va)
        {
            if (sol::type::string == v.get_type())
            {
                msg << v.as<const char*>() << " ";
                continue;
            }

            sol::function ts = e["tostring"];
            if (ts.valid())
            {
                sol::object str = ts ((sol::object) v);
                if (str.valid())
                    if (const char* sstr = str.as<const char*>())
                        msg << sstr << "  ";
            }
        }

        if (msg.isNotEmpty())
        {
            // Logger::writeToLog is thread-safe — no MessageManagerLock needed.
            Logger::writeToLog (msg);
        }
    });

    scriptOwner.reset (new DSPScript (lua.create_table()));
    activeScript.store (scriptOwner.get(), std::memory_order_release);

    // Stop automatic Lua GC — it allocates/frees non-deterministically.
    // GC steps are run explicitly on the message thread in loadScript().
    lua_gc (lua.lua_state(), LUA_GCSTOP, 0);

    dspCode.replaceAllContent (String::fromUTF8 (
        scripts::amp_lua, scripts::amp_luaSize));
    loadScript (dspCode.getAllContent());
    edCode.replaceAllContent (String::fromUTF8 (
        scripts::ampui_lua, scripts::ampui_luaSize));

    refreshPorts();
}

ScriptNode::~ScriptNode()
{
    activeScript.store (nullptr, std::memory_order_release);
    retiredScript.reset();
    scriptOwner.reset();
}

void ScriptNode::refreshPorts()
{
    if (scriptOwner == nullptr)
        return;
    PortList newPorts;
    scriptOwner->getPorts (newPorts);
    setPorts (newPorts);
    if (auto g = getParentGraph())
        g->triggerAsyncUpdate();
}

void ScriptNode::setPlayHead (juce::AudioPlayHead* playhead)
{
    Processor::setPlayHead (playhead);
    if (scriptOwner)
        scriptOwner->setPlayHead (playhead);
}

ParameterPtr ScriptNode::getParameter (const PortDescription& port)
{
    jassert (port.type == PortType::Control);
    return scriptOwner ? scriptOwner->getParameterObject (port.channel, port.input) : nullptr;
}

Result ScriptNode::loadScript (const String& newCode)
{
    // This method runs on the message thread only.
    auto result = DSPScript::validate (newCode);
    if (result.failed())
        return result;

    // Clean up any previously retired script before loading a new one.
    retiredScript.reset();

    ScriptLoader loader (lua);
    loader.load (newCode);
    if (loader.hasError())
        return Result::fail (loader.getErrorMessage());

    auto dsp = loader();
    if (! dsp.valid() || dsp.get_type() != sol::type::table)
        return Result::fail ("Could not instantiate script");

    // Prepare the new script fully before swapping (no lock needed).
    auto newScript = std::make_unique<DSPScript> (dsp);
    newScript->setPlayHead (getPlayHead());
    if (prepared)
        newScript->prepare (sampleRate, blockSize);
    triggerPortReset();

    if (scriptOwner != nullptr)
        newScript->copyParameterValues (*scriptOwner);

    // Atomically swap: audio thread will pick up the new script pointer.
    auto oldScript = std::move (scriptOwner);
    scriptOwner = std::move (newScript);
    activeScript.store (scriptOwner.get(), std::memory_order_release);

    // Retire the old script — release resources and call cleanup on message thread.
    if (oldScript != nullptr)
    {
        oldScript->release();
        oldScript->cleanup();
        retiredScript = std::move (oldScript);
    }

    // Run incremental Lua GC on the message thread (never on audio thread).
    lua_gc (lua.lua_state(), LUA_GCSTEP, 10);

    return Result::ok();
}

void ScriptNode::getPluginDescription (PluginDescription& desc) const
{
    desc.name = "Script";
    desc.fileOrIdentifier = EL_NODE_ID_SCRIPT;
    desc.uniqueId = EL_NODE_UID_SCRIPT;
    desc.descriptiveName = "A user scriptable Element node";
    desc.numInputChannels = 0;
    desc.numOutputChannels = 0;
    desc.hasSharedContainer = false;
    desc.isInstrument = false;
    desc.manufacturerName = EL_NODE_FORMAT_AUTHOR;
    desc.pluginFormatName = EL_NODE_FORMAT_NAME;
    desc.version = "1.0.0";
}

void ScriptNode::prepareToRender (double rate, int block)
{
    if (prepared)
        return;
    sampleRate = rate;
    blockSize = block;
    if (scriptOwner)
        scriptOwner->prepare (sampleRate, blockSize);
    prepared = true;
}

void ScriptNode::releaseResources()
{
    if (! prepared)
        return;
    prepared = false;
    if (scriptOwner)
        scriptOwner->release();
}

void ScriptNode::render (RenderContext& rc)
{
    // Lock-free: load the active script pointer atomically.
    if (auto* s = activeScript.load (std::memory_order_acquire))
        s->process (rc.audio, rc.midi);
}

void ScriptNode::setState (const void* data, int size)
{
    const auto state = ValueTree::readFromGZIPData (data, size);
    if (state.isValid())
    {
        dspCode.replaceAllContent (state["dspCode"].toString());
        edCode.replaceAllContent (state["editorCode"].toString());

        auto result = loadScript (dspCode.getAllContent());

        if (result.wasOk())
        {
            if (state.hasProperty ("data"))
            {
                const var& scriptData = state.getProperty ("data");
                if (scriptData.isBinaryData())
                    if (auto* block = scriptData.getBinaryData())
                        scriptOwner->restore (block->getData(), block->getSize());
            }
        }

        sendChangeMessage();
    }
}

void ScriptNode::getState (MemoryBlock& out)
{
    ValueTree state ("ScriptNode");
    state.setProperty ("dspCode", dspCode.getAllContent(), nullptr)
        .setProperty ("editorCode", edCode.getAllContent(), nullptr);

    MemoryBlock block;
    if (scriptOwner)
        scriptOwner->save (block);
    if (block.getSize() > 0)
        state.setProperty ("data", block, nullptr);
    block.reset();

    MemoryOutputStream mo (out, false);
    {
        GZIPCompressorOutputStream gz (mo);
        state.writeToStream (gz);
    }
}

void ScriptNode::setParameter (int index, float value)
{
    juce::ignoreUnused (index, value);
}

//==============================================================================
const String ScriptNode::getProgramName (int index) const
{
    if (! juce::isPositiveAndBelow (index, getNumPrograms()))
        return {};

    switch (index)
    {
        case 0:
            return "Amp";
            break;
        case 1:
            return "Channelizer";
            break;
        case 2:
            return "Spoton Scale Chooser";
            break;
        case 3:
            return "MIDI Timecode (MTC) Generator";
            break;
    }

    String name = TRANS ("Program");
    name << " " << int (index + 1);
    return name;
}

void ScriptNode::setCurrentProgram (int index)
{
    if (! juce::isPositiveAndBelow (index, getNumPrograms()))
        return;
    _program = index;

    String newDspCode, newUiCode;

    switch (index)
    {
        case 0:
            newDspCode = String::fromUTF8 (scripts::amp_lua, scripts::amp_luaSize);
            newUiCode = String::fromUTF8 (scripts::ampui_lua, scripts::ampui_luaSize);
            break;
        case 1:
            newDspCode = String::fromUTF8 (scripts::channelize_lua, scripts::channelize_luaSize);
            newUiCode.clear();
            break;
        case 2:
            newDspCode = String::fromUTF8 (scripts::spontonchordchooser_lua, scripts::spontonchordchooser_luaSize);
            newUiCode.clear();
            break;
        case 3:
            newDspCode = String::fromUTF8 (scripts::mtc_generator_lua, scripts::mtc_generator_luaSize);
            newUiCode.clear();
    }

    dspCode.replaceAllContent (newDspCode);
    loadScript (dspCode.getAllContent());
    edCode.replaceAllContent (newUiCode);
}

} // namespace element
