// SPDX-License-Identifier: GPL-3.0-or-later
//
// Round-trip tests for the sandboxed-plugin parameter forwarding (P0-3).
//
// These tests run in-process: they exercise the IPC wire protocol
// (createSandboxMessage / parseSandboxMessage / createPluginInfoMessage /
// parsePluginInfoMessage) and the host-side SandboxParameter proxy without
// launching a real worker subprocess. End-to-end subprocess testing is
// deferred to a separate harness — this suite covers the surfaces where
// bugs are most likely (serialization edge cases + the host-to-worker push).

#include <boost/test/unit_test.hpp>

#include <element/plugins.hpp>

#include "engine/sandboxipc.hpp"
#include "engine/sandboxhost.hpp"
#include "engine/sandboxparameter.hpp"

#include <cstring>
#include <vector>

namespace element {

//==============================================================================
// Test stub: SandboxHost subclass that captures outbound IPC instead of
// sending it over a real worker pipe. The default sendMessage is virtual
// (US-6), so this override is enough — no need to launch a worker process.
class CapturingSandboxHost : public SandboxHost
{
public:
    using SandboxHost::SandboxHost;

    struct Capture
    {
        SandboxMessageType type;
        juce::MemoryBlock payload;
    };

    std::vector<Capture> outbound;

    void sendMessage (SandboxMessageType type,
                       const void* payload,
                       uint32_t payloadSize) override
    {
        Capture c;
        c.type = type;
        if (payload != nullptr && payloadSize > 0)
            c.payload = juce::MemoryBlock (payload, payloadSize);
        outbound.push_back (std::move (c));
    }
};

} // namespace element

using namespace element;

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxParameterRoundTripTests)

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (parameter_change_payload_round_trips)
{
    ParameterChangePayload original;
    original.parameterIndex = 42;
    original.value = 0.7f;

    auto block = createSandboxMessage (SandboxMessageType::SetParameter,
                                        &original, sizeof (original), 1234);

    SandboxMessageHeader header;
    const void* payload = nullptr;
    BOOST_REQUIRE (parseSandboxMessage (block, header, payload));

    BOOST_CHECK (header.type == SandboxMessageType::SetParameter);
    BOOST_CHECK_EQUAL (header.payloadSize, (uint32_t) sizeof (ParameterChangePayload));
    BOOST_CHECK_EQUAL (header.sequenceNumber, 1234u);
    BOOST_REQUIRE (payload != nullptr);

    ParameterChangePayload parsed;
    std::memcpy (&parsed, payload, sizeof (parsed));
    BOOST_CHECK_EQUAL (parsed.parameterIndex, 42u);
    BOOST_CHECK_EQUAL (parsed.value, 0.7f);
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_payload_round_trips)
{
    PluginInfoPayload info;
    info.numParameters = 3;
    info.numInputChannels = 2;
    info.numOutputChannels = 2;
    info.isInstrument = 1;
    info.acceptsMidi = 1;
    info.producesMidi = 0;

    juce::StringArray names;
    names.add ("Cutoff");
    names.add ("Resonance");
    names.add ("Drive");

    auto block = createPluginInfoMessage (info, names);

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    BOOST_REQUIRE (parsePluginInfoMessage (block.getData(),
                                           (uint32_t) block.getSize(),
                                           parsed, parsedNames));

    BOOST_CHECK_EQUAL (parsed.numParameters, 3u);
    BOOST_CHECK_EQUAL (parsed.numInputChannels, 2u);
    BOOST_CHECK_EQUAL (parsed.numOutputChannels, 2u);
    BOOST_CHECK_EQUAL (parsed.isInstrument, 1u);
    BOOST_CHECK_EQUAL (parsed.acceptsMidi, 1u);
    BOOST_CHECK_EQUAL (parsed.producesMidi, 0u);
    BOOST_REQUIRE_EQUAL (parsedNames.size(), 3);
    BOOST_CHECK_EQUAL (parsedNames[0].toStdString(), "Cutoff");
    BOOST_CHECK_EQUAL (parsedNames[1].toStdString(), "Resonance");
    BOOST_CHECK_EQUAL (parsedNames[2].toStdString(), "Drive");
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_payload_rejects_truncation)
{
    PluginInfoPayload info;
    info.numParameters = 2;
    info.numInputChannels = 2;
    info.numOutputChannels = 2;
    info.acceptsMidi = 1;

    juce::StringArray names;
    names.add ("A");
    names.add ("B");

    auto block = createPluginInfoMessage (info, names);

    // Truncate by 1 byte — last name's last byte is missing.
    BOOST_REQUIRE (block.getSize() > 1);
    const uint32_t truncatedSize = (uint32_t) (block.getSize() - 1);

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    BOOST_CHECK (! parsePluginInfoMessage (block.getData(), truncatedSize,
                                            parsed, parsedNames));
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_payload_rejects_overlarge)
{
    // Manually craft a payload that *claims* numParameters > the cap. The
    // serialization helper would clip the names to the cap, so we forge the
    // header bytes directly to simulate a malicious or buggy worker.
    PluginInfoPayload info;
    info.numParameters = EL_SANDBOX_MAX_PARAMETERS + 1;
    info.paramNamesLength = 0;

    juce::MemoryBlock raw (sizeof (PluginInfoPayload));
    std::memcpy (raw.getData(), &info, sizeof (info));

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    BOOST_CHECK (! parsePluginInfoMessage (raw.getData(),
                                            (uint32_t) raw.getSize(),
                                            parsed, parsedNames));
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_v2_meta_round_trips)
{
    PluginInfoPayload info;
    info.numParameters = 3;
    info.numInputChannels = 1;
    info.numOutputChannels = 2;

    juce::StringArray names { "Cutoff", "Mode", "Bypass" };

    juce::Array<SandboxParamMeta> metas;
    SandboxParamMeta cutoff;
    cutoff.defaultValue = 0.25f;
    cutoff.minValue = 20.0f;
    cutoff.maxValue = 20000.0f;
    metas.add (cutoff);

    SandboxParamMeta mode;
    mode.defaultValue = 0.0f;
    mode.stepped = 1;
    mode.numSteps = 4;
    metas.add (mode);

    SandboxParamMeta bypass;
    bypass.defaultValue = 0.0f;
    bypass.stepped = 1;
    bypass.boolean = 1;
    bypass.numSteps = 2;
    metas.add (bypass);

    juce::StringArray labels { "Hz", "", "" };

    auto block = createPluginInfoMessage (info, names, &metas, &labels);

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    juce::Array<SandboxParamMeta> parsedMetas;
    juce::StringArray parsedLabels;
    BOOST_REQUIRE (parsePluginInfoMessage (block.getData(), (uint32_t) block.getSize(),
                                           parsed, parsedNames, &parsedMetas, &parsedLabels));

    BOOST_CHECK (parsed.paramMetaLength > 0);
    BOOST_REQUIRE_EQUAL (parsedNames.size(), 3);
    BOOST_REQUIRE_EQUAL (parsedMetas.size(), 3);
    BOOST_REQUIRE_EQUAL (parsedLabels.size(), 3);

    BOOST_CHECK_EQUAL (parsedMetas[0].defaultValue, 0.25f);
    BOOST_CHECK_EQUAL (parsedMetas[0].minValue, 20.0f);
    BOOST_CHECK_EQUAL (parsedMetas[0].maxValue, 20000.0f);
    BOOST_CHECK_EQUAL ((int) parsedMetas[0].stepped, 0);
    BOOST_CHECK_EQUAL (parsedLabels[0].toStdString(), "Hz");

    BOOST_CHECK_EQUAL ((int) parsedMetas[1].stepped, 1);
    BOOST_CHECK_EQUAL ((int) parsedMetas[1].numSteps, 4);
    BOOST_CHECK_EQUAL ((int) parsedMetas[1].boolean, 0);

    BOOST_CHECK_EQUAL ((int) parsedMetas[2].boolean, 1);
    BOOST_CHECK_EQUAL ((int) parsedMetas[2].numSteps, 2);
    BOOST_CHECK_EQUAL (parsedLabels[2].toStdString(), "");
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_v1_payload_still_parses_without_metas)
{
    // v1 payload: no meta table (paramMetaLength == 0). Parser must accept it
    // and leave metas/labels empty so the host degrades to synthesized defaults.
    PluginInfoPayload info;
    info.numParameters = 2;

    juce::StringArray names { "A", "B" };
    auto block = createPluginInfoMessage (info, names); // no metas/labels

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    juce::Array<SandboxParamMeta> parsedMetas;
    juce::StringArray parsedLabels;
    BOOST_REQUIRE (parsePluginInfoMessage (block.getData(), (uint32_t) block.getSize(),
                                           parsed, parsedNames, &parsedMetas, &parsedLabels));

    BOOST_CHECK_EQUAL (parsed.paramMetaLength, 0u);
    BOOST_REQUIRE_EQUAL (parsedNames.size(), 2);
    BOOST_CHECK_EQUAL (parsedMetas.size(), 0);
    BOOST_CHECK_EQUAL (parsedLabels.size(), 0);
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (plugin_info_v2_rejects_truncated_meta_table)
{
    PluginInfoPayload info;
    info.numParameters = 1;
    juce::StringArray names { "Gain" };
    juce::Array<SandboxParamMeta> metas;
    metas.add (SandboxParamMeta {});
    juce::StringArray labels { "dB" };

    auto block = createPluginInfoMessage (info, names, &metas, &labels);

    PluginInfoPayload parsed {};
    juce::StringArray parsedNames;
    BOOST_CHECK (! parsePluginInfoMessage (block.getData(),
                                           (uint32_t) (block.getSize() - 1),
                                           parsed, parsedNames));
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (sandbox_parameter_setvalue_emits_one_ipc)
{
    PluginManager pm;  // construction is enough — we don't need it active.
    CapturingSandboxHost host (pm);

    SandboxParameter param (host, 7, "Cutoff", 0.5f);
    BOOST_REQUIRE (host.outbound.empty());

    param.setValue (0.42f);

    BOOST_REQUIRE_EQUAL (host.outbound.size(), (size_t) 1);
    BOOST_CHECK (host.outbound[0].type == SandboxMessageType::SetParameter);
    BOOST_REQUIRE_EQUAL (host.outbound[0].payload.getSize(),
                          (size_t) sizeof (ParameterChangePayload));

    ParameterChangePayload pc;
    std::memcpy (&pc, host.outbound[0].payload.getData(), sizeof (pc));
    BOOST_CHECK_EQUAL (pc.parameterIndex, 7u);
    BOOST_CHECK_EQUAL (pc.value, 0.42f);

    BOOST_CHECK_EQUAL (param.getValue(), 0.42f);
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (sandbox_parameter_apply_from_worker_does_not_echo)
{
    PluginManager pm;
    CapturingSandboxHost host (pm);

    SandboxParameter param (host, 3, "Drive", 0.0f);

    param.applyValueFromWorker (0.3f);

    BOOST_CHECK (host.outbound.empty());
    BOOST_CHECK_EQUAL (param.getValue(), 0.3f);
}

BOOST_AUTO_TEST_SUITE_END()
