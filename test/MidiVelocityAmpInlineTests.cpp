// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/context.hpp>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include "nodes/midivelocityamp.hpp"
#include "engine/graphnode.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiVelocityAmpInlineTests)

BOOST_AUTO_TEST_CASE (ScaleAndPowerExposed)
{
    Context context;
    GraphNode graph (context);
    ProcessorPtr node = graph.addNode (new MidiVelocityAmpNode());
    auto* ip = dynamic_cast<InlineParamControl*> (node.get());
    BOOST_REQUIRE (ip != nullptr);

    BOOST_REQUIRE (ip->setInlineParam ("scale", 2.0));
    BOOST_REQUIRE (ip->setInlineParam ("power", 0.5));
    BOOST_REQUIRE (! ip->setInlineParam ("bogus", 1.0));

    Array<InlineParamInfo> infos;
    ip->getInlineParams (infos);
    BOOST_REQUIRE_EQUAL (infos.size(), 2);
    BOOST_REQUIRE (infos[0].key == "scale" && infos[1].key == "power");
    BOOST_REQUIRE_CLOSE (infos[0].value, 2.0, 0.001);
    BOOST_REQUIRE_CLOSE (infos[1].value, 0.5, 0.001);
    BOOST_REQUIRE_CLOSE (infos[0].max, 2.0, 0.001);

    node = nullptr;
    graph.clear();
}

BOOST_AUTO_TEST_SUITE_END()
