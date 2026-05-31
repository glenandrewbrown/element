// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include "ringbuffer.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (RingBufferTests)

BOOST_AUTO_TEST_CASE (InitialState)
{
    RingBuffer rb (256);
    BOOST_CHECK_EQUAL (rb.size(), 256u);
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
    BOOST_CHECK_EQUAL (rb.getWriteSpace(), 256u);
    BOOST_CHECK (! rb.canRead (1));
    BOOST_CHECK (rb.canWrite (1));
}

BOOST_AUTO_TEST_CASE (WriteThenRead)
{
    RingBuffer rb (64);
    int src = 0xDEADBEEF;
    rb.write (src);

    BOOST_CHECK (rb.canRead (sizeof (int)));
    int dst = 0;
    rb.read (dst);
    BOOST_CHECK_EQUAL (dst, 0xDEADBEEF);
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
}

BOOST_AUTO_TEST_CASE (PeekDoesNotAdvance)
{
    RingBuffer rb (64);
    int src = 42;
    rb.write (src);

    int dst1 = 0, dst2 = 0;
    rb.peak (&dst1, sizeof (int));
    rb.peak (&dst2, sizeof (int));
    BOOST_CHECK_EQUAL (dst1, 42);
    BOOST_CHECK_EQUAL (dst2, 42);
    // Read space still present after peek
    BOOST_CHECK (rb.canRead (sizeof (int)));
}

BOOST_AUTO_TEST_CASE (Clear)
{
    RingBuffer rb (64);
    int src = 99;
    rb.write (src);
    BOOST_CHECK (rb.canRead (sizeof (int)));
    rb.clear();
    BOOST_CHECK (! rb.canRead (1));
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
}

BOOST_AUTO_TEST_CASE (MultipleWritesAndReads)
{
    RingBuffer rb (256);
    for (int i = 0; i < 10; ++i)
        rb.write (i);

    for (int i = 0; i < 10; ++i)
    {
        int val = -1;
        rb.read (val);
        BOOST_CHECK_EQUAL (val, i);
    }
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
}

BOOST_AUTO_TEST_CASE (CannotWriteBeyondCapacity)
{
    RingBuffer rb (8);
    // 8-byte capacity; write fills it
    uint64_t big = 0xFFFF;
    rb.write (big); // 8 bytes
    // Now full — canWrite(1) should be false
    BOOST_CHECK (! rb.canWrite (1));
}

BOOST_AUTO_TEST_CASE (CannotReadFromEmpty)
{
    RingBuffer rb (64);
    BOOST_CHECK (! rb.canRead (1));
}

BOOST_AUTO_TEST_CASE (WrapAround)
{
    // Fill, drain, fill again to exercise wrap-around path
    RingBuffer rb (16);
    uint32_t a = 0xAAAA, b = 0xBBBB, c = 0xCCCC, d = 0xDDDD;
    rb.write (a); rb.write (b); rb.write (c); rb.write (d); // 16 bytes
    uint32_t out;
    rb.read (out); BOOST_CHECK_EQUAL (out, a);
    rb.read (out); BOOST_CHECK_EQUAL (out, b);
    // Now write new data — will wrap
    rb.write (a); rb.write (b);
    rb.read (out); BOOST_CHECK_EQUAL (out, c);
    rb.read (out); BOOST_CHECK_EQUAL (out, d);
    rb.read (out); BOOST_CHECK_EQUAL (out, a);
    rb.read (out); BOOST_CHECK_EQUAL (out, b);
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
}

BOOST_AUTO_TEST_CASE (SetCapacity)
{
    RingBuffer rb (64);
    rb.setCapacity (128);
    BOOST_CHECK_EQUAL (rb.size(), 128u);
    BOOST_CHECK_EQUAL (rb.getReadSpace(), 0u);
}

BOOST_AUTO_TEST_SUITE_END()
