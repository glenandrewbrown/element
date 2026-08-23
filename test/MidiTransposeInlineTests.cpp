// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>

#include "nodes/miditranspose.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiTransposeInlineTests)

BOOST_AUTO_TEST_CASE (SetInlineParamShiftsNotesAndReports)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new MidiTransposeNode());

    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    // unknown key rejected
    BOOST_REQUIRE (! ip->setInlineParam ("nope", 5.0));

    // set +12 semitones via the inline surface
    BOOST_REQUIRE (ip->setInlineParam ("semitones", 12.0));

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 1);
    BOOST_REQUIRE (infos[0].key == "semitones");
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 12);
    BOOST_REQUIRE_EQUAL ((int) infos[0].min, -48);
    BOOST_REQUIRE_EQUAL ((int) infos[0].max, 48);

    // render a note → it is transposed up an octave (parity preserved)
    MidiBuffer midi;
    AudioSampleBuffer audio, cv;
    audio.setSize (2, 256, false, true, false);
    midi.addEvent (MidiMessage::noteOn (1, 60, (uint8) 100), 0);
    RenderContext rc (audio, cv, midi, audio.getNumSamples());
    node->render (rc);

    bool sawTransposed = false;
    for (auto m : midi)
        if (m.getMessage().isNoteOn() && m.getMessage().getNoteNumber() == 72)
            sawTransposed = true;
    BOOST_REQUIRE (sawTransposed);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
