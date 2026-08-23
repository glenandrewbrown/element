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
