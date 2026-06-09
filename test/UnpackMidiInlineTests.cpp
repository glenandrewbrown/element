// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/unpackmidi.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (UnpackMidiInlineTests)

BOOST_AUTO_TEST_CASE (CcAndChannelExposed)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new UnpackMidiNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    ip->setInlineParam ("cc", 1.0);
    ip->setInlineParam ("channel", 1.0);

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 1);
    BOOST_REQUIRE_EQUAL ((int) infos[1].value, 1);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
