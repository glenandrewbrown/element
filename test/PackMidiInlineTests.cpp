// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/packmidi.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (PackMidiInlineTests)

BOOST_AUTO_TEST_CASE (CcAndChannelExposedAndClamped)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new PackMidiNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    ip->setInlineParam ("cc", 74.0);
    ip->setInlineParam ("channel", 99.0); // out of range → clamps to 16

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE (infos[0].key == "cc" && infos[1].key == "channel");
    BOOST_REQUIRE_EQUAL ((int) infos[0].value, 74);
    BOOST_REQUIRE_EQUAL ((int) infos[1].value, 16);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
