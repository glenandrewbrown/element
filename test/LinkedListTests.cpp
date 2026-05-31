// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for LinkedList<T> template (include/element/linkedlist.hpp).
// Gap: template used heavily by TimeScale/Shuttle with zero direct tests.

#include <boost/test/unit_test.hpp>
#include <element/linkedlist.hpp>

using namespace element;

// Minimal concrete node for testing
struct TestNode : public LinkedList<TestNode>::Link {
    explicit TestNode (int v = 0) : value (v) {}
    int value;
};

BOOST_AUTO_TEST_SUITE (LinkedListTests)

// ── Default construction ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (EmptyListHasZeroCount)
{
    LinkedList<TestNode> list;
    BOOST_CHECK_EQUAL (list.count(), 0);
    BOOST_CHECK (list.first() == nullptr);
    BOOST_CHECK (list.last() == nullptr);
}

// ── append / prepend ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AppendOneNodeUpdatesFirstLast)
{
    LinkedList<TestNode> list;
    TestNode n (42);
    list.append (&n);
    BOOST_CHECK_EQUAL (list.count(), 1);
    BOOST_CHECK_EQUAL (list.first(), &n);
    BOOST_CHECK_EQUAL (list.last(), &n);
}

BOOST_AUTO_TEST_CASE (AppendTwoNodesOrderPreserved)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&a);
    list.append (&b);
    BOOST_CHECK_EQUAL (list.count(), 2);
    BOOST_CHECK_EQUAL (list.first(), &a);
    BOOST_CHECK_EQUAL (list.last(), &b);
    BOOST_CHECK_EQUAL (list.first()->next(), &b);
    BOOST_CHECK_EQUAL (list.last()->prev(), &a);
}

BOOST_AUTO_TEST_CASE (PrependPlacesBeforeExisting)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&b);
    list.prepend (&a);
    BOOST_CHECK_EQUAL (list.first(), &a);
    BOOST_CHECK_EQUAL (list.last(), &b);
}

// ── at() ─────────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AtReturnsCorrectNode)
{
    LinkedList<TestNode> list;
    TestNode a (10), b (20), c (30);
    list.append (&a);
    list.append (&b);
    list.append (&c);
    BOOST_CHECK_EQUAL (list.at (0), &a);
    BOOST_CHECK_EQUAL (list.at (1), &b);
    BOOST_CHECK_EQUAL (list.at (2), &c);
}

BOOST_AUTO_TEST_CASE (AtOutOfRangeReturnsNull)
{
    LinkedList<TestNode> list;
    TestNode n (1);
    list.append (&n);
    BOOST_CHECK (list.at (-1) == nullptr);
    BOOST_CHECK (list.at (1)  == nullptr);
}

BOOST_AUTO_TEST_CASE (BracketOperatorEquivToAt)
{
    LinkedList<TestNode> list;
    TestNode n (99);
    list.append (&n);
    BOOST_CHECK_EQUAL (list[0], &n);
}

// ── find() ───────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (FindReturnsCorrectIndex)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2), c (3);
    list.append (&a);
    list.append (&b);
    list.append (&c);
    BOOST_CHECK_EQUAL (list.find (&a), 0);
    BOOST_CHECK_EQUAL (list.find (&b), 1);
    BOOST_CHECK_EQUAL (list.find (&c), 2);
}

BOOST_AUTO_TEST_CASE (FindMissingNodeReturnsNegative)
{
    LinkedList<TestNode> list;
    TestNode a (1), outsider (99);
    list.append (&a);
    BOOST_CHECK_EQUAL (list.find (&outsider), -1);
}

// ── unlink / remove ──────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (UnlinkMiddleNodeUpdatesNeighbours)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2), c (3);
    list.append (&a);
    list.append (&b);
    list.append (&c);
    list.unlink (&b);
    BOOST_CHECK_EQUAL (list.count(), 2);
    BOOST_CHECK_EQUAL (list.first(), &a);
    BOOST_CHECK_EQUAL (list.last(), &c);
    BOOST_CHECK_EQUAL (a.next(), &c);
    BOOST_CHECK_EQUAL (c.prev(), &a);
}

BOOST_AUTO_TEST_CASE (UnlinkHeadUpdatesFirst)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&a);
    list.append (&b);
    list.unlink (&a);
    BOOST_CHECK_EQUAL (list.first(), &b);
    BOOST_CHECK (list.last()->prev() == nullptr);
}

BOOST_AUTO_TEST_CASE (UnlinkTailUpdatesLast)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&a);
    list.append (&b);
    list.unlink (&b);
    BOOST_CHECK_EQUAL (list.last(), &a);
}

// ── clear() ──────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ClearResetsToEmpty)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&a);
    list.append (&b);
    list.clear();
    BOOST_CHECK_EQUAL (list.count(), 0);
    BOOST_CHECK (list.first() == nullptr);
    BOOST_CHECK (list.last() == nullptr);
}

// ── Range-for iterator ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (IteratorVisitsAllNodesInOrder)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2), c (3);
    list.append (&a);
    list.append (&b);
    list.append (&c);

    int expected = 1;
    for (auto* n : list)
    {
        BOOST_CHECK_EQUAL (n->value, expected++);
    }
    BOOST_CHECK_EQUAL (expected, 4); // all 3 visited
}

BOOST_AUTO_TEST_CASE (IteratorOnEmptyListDoesNotIterate)
{
    LinkedList<TestNode> list;
    int count = 0;
    for (auto* n : list) { (void) n; ++count; }
    BOOST_CHECK_EQUAL (count, 0);
}

// ── insertBefore / insertAfter with explicit prev/next ───────────────────────

BOOST_AUTO_TEST_CASE (InsertBeforeHeadBecomesNewHead)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (0);
    list.append (&a);
    list.insertBefore (&b, &a); // insert b before a
    BOOST_CHECK_EQUAL (list.first(), &b);
    BOOST_CHECK_EQUAL (list.at (1), &a);
}

BOOST_AUTO_TEST_CASE (InsertAfterTailBecomesNewTail)
{
    LinkedList<TestNode> list;
    TestNode a (1), b (2);
    list.append (&a);
    list.insertAfter (&b, &a); // insert b after a
    BOOST_CHECK_EQUAL (list.last(), &b);
    BOOST_CHECK_EQUAL (list.count(), 2);
}

BOOST_AUTO_TEST_SUITE_END()
