// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include "matrixstate.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (MatrixStateTests)

BOOST_AUTO_TEST_CASE (DefaultCtorIsEmpty)
{
    MatrixState m;
    BOOST_CHECK (m.isEmpty());
    BOOST_CHECK (! m.isNotEmpty());
    BOOST_CHECK_EQUAL (m.getNumRows(), 0);
    BOOST_CHECK_EQUAL (m.getNumColumns(), 0);
}

BOOST_AUTO_TEST_CASE (SizedCtorNotEmpty)
{
    MatrixState m (4, 4);
    BOOST_CHECK (! m.isEmpty());
    BOOST_CHECK (m.isNotEmpty());
    BOOST_CHECK_EQUAL (m.getNumRows(), 4);
    BOOST_CHECK_EQUAL (m.getNumColumns(), 4);
}

BOOST_AUTO_TEST_CASE (ConnectDisconnect)
{
    MatrixState m (4, 4);
    BOOST_CHECK (! m.connected (0, 0));
    m.connect (0, 0);
    BOOST_CHECK (m.connected (0, 0));
    m.disconnect (0, 0);
    BOOST_CHECK (! m.connected (0, 0));
}

BOOST_AUTO_TEST_CASE (ToggleCell)
{
    MatrixState m (4, 4);
    BOOST_CHECK (! m.isCellToggled (2, 3));
    bool ok = m.toggleCell (2, 3);
    BOOST_CHECK (ok);
    BOOST_CHECK (m.isCellToggled (2, 3));
    m.toggleCell (2, 3);
    BOOST_CHECK (! m.isCellToggled (2, 3));
}

BOOST_AUTO_TEST_CASE (SetOnOff)
{
    MatrixState m (4, 4);
    m.set (1, 1, true);
    BOOST_CHECK (m.connected (1, 1));
    m.set (1, 1, false);
    BOOST_CHECK (! m.connected (1, 1));
}

BOOST_AUTO_TEST_CASE (IndexComputation)
{
    MatrixState m (4, 4);
    // row=2, col=3 -> index = 2*4 + 3 = 11
    BOOST_CHECK_EQUAL (m.getIndexForCell (2, 3), 11);
    m.connect (2, 3);
    BOOST_CHECK (m.connectedAtIndex (11));
}

BOOST_AUTO_TEST_CASE (CopyConstructor)
{
    MatrixState a (3, 3);
    a.connect (0, 1);
    a.connect (2, 2);
    MatrixState b (a);
    BOOST_CHECK (b.connected (0, 1));
    BOOST_CHECK (b.connected (2, 2));
    BOOST_CHECK (! b.connected (0, 0));
}

BOOST_AUTO_TEST_CASE (AssignmentAndEquality)
{
    MatrixState a (3, 3);
    a.connect (1, 2);
    MatrixState b (3, 3);
    b = a;
    BOOST_CHECK (a == b);
    b.connect (0, 0);
    BOOST_CHECK (! (a == b));
}

BOOST_AUTO_TEST_CASE (SameSizeAs)
{
    MatrixState a (4, 4), b (4, 4), c (2, 4);
    BOOST_CHECK (a.sameSizeAs (b));
    BOOST_CHECK (! a.sameSizeAs (c));
}

BOOST_AUTO_TEST_CASE (ResizeRetain)
{
    MatrixState m (4, 4);
    m.connect (0, 0);
    m.connect (1, 1);
    m.resize (4, 4, true);
    BOOST_CHECK (m.connected (0, 0));
    BOOST_CHECK (m.connected (1, 1));
}

BOOST_AUTO_TEST_CASE (ResizeNoRetain)
{
    MatrixState m (4, 4);
    m.connect (0, 0);
    m.resize (4, 4, false);
    BOOST_CHECK (! m.connected (0, 0));
}

BOOST_AUTO_TEST_CASE (ResizeGrowth)
{
    MatrixState m (2, 2);
    m.connect (0, 0);
    m.resize (4, 4, true);
    BOOST_CHECK_EQUAL (m.getNumRows(), 4);
    BOOST_CHECK_EQUAL (m.getNumColumns(), 4);
    BOOST_CHECK (m.connected (0, 0));
}

#if JUCE_MODULE_AVAILABLE_juce_data_structures
BOOST_AUTO_TEST_CASE (ValueTreeRoundTrip)
{
    MatrixState a (3, 3);
    a.connect (0, 1);
    a.connect (2, 0);
    auto tree = a.createValueTree();
    MatrixState b;
    b.restoreFromValueTree (tree);
    BOOST_CHECK (a == b);
}
#endif

BOOST_AUTO_TEST_SUITE_END()
