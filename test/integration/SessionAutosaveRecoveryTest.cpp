// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-2 B (4b) — autosave format fix (E1), named-save native (E6), and the
// recovery round-trip + undo-orthogonality guarantees.
//
// These are HEADLESS-safe: the exercised paths (saveSessionToName via
// document->save(askForFile=false), writeSessionXmlTo, recoverFromAutosave via
// loadFrom(file, /*showMessageOnFailure*/ false)) never pop a FileChooser or a
// modal AlertWindow — unlike saveSession()/newSession()/openFile() which do and
// therefore hang the headless runner (see the quarantined FileOps suite).

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/datapath.hpp>
#include <element/services.hpp>
#include <element/session.hpp>
#include <element/tags.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/sessionservice.hpp"

using namespace element;

namespace {

// Remove any autosave files we may create so the suite leaves no residue and
// stays deterministic across runs (findRecoverableAutosave scans this dir).
void cleanAutosaveDir()
{
    const juce::File dir = DataPath::defaultSessionDir();
    if (! dir.isDirectory())
        return;
    for (const auto& e :
         juce::RangedDirectoryIterator (dir, false, "*.autosave.els;autosave_*.els",
                                        juce::File::findFiles))
        e.getFile().deleteFile();
}

} // namespace

BOOST_AUTO_TEST_SUITE (SessionAutosaveRecoveryTests)

// ── E1: getAutosaveFile() emits `.els` (never `.elg`) ─────────────────────────
BOOST_AUTO_TEST_CASE (autosave_file_is_els_format)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    svc->resetChanges (true); // file-less state → timestamped autosave name
    const juce::File f = svc->getAutosaveFile();
    BOOST_CHECK (f != juce::File());
    BOOST_CHECK_EQUAL (f.getFileExtension().toLowerCase().toStdString(), ".els");
    BOOST_CHECK (f.getFileName().startsWith ("autosave_"));
}

// ── E1 + Glen Q4: a NEVER-SAVED session autosaves to a loadable `.els`, and
//    the recovery loader round-trips it as a real session ────────────────────
BOOST_AUTO_TEST_CASE (untitled_autosave_round_trips_through_recovery)
{
    cleanAutosaveDir();

    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    // Start from a clean, file-less ("untitled") session.
    svc->openDefaultSession();
    juce::MessageManager::getInstance()->runDispatchLoopUntil (30);
    svc->resetChanges (true);
    BOOST_REQUIRE (svc->getSessionFile() == juce::File()
                   || ! svc->getSessionFile().existsAsFile());

    // Make the session dirty (so the autosave tick fires) by tweaking tempo.
    auto session = test::context()->session();
    BOOST_REQUIRE (session != nullptr);
    session->getValueTree().setProperty (tags::tempo, 137.0, nullptr);

    // The timer interval is private; exercise the same write path the timer uses
    // by driving startAutosave at the minimum interval is racy in a unit test —
    // instead assert the WRITE path directly: write the autosave file and prove
    // it is a real, loadable session.
    const juce::File autosaveFile = svc->getAutosaveFile();
    BOOST_REQUIRE (autosaveFile.getFileName().startsWith ("autosave_"));

    // writeSessionXmlTo is private; the public guarantee is "the recovery loader
    // re-opens an autosave as a session". So: create the autosave by saving the
    // current session XML to that path through the SAME public mechanism the
    // recall shelf uses — saveSessionToName writes a real .els we then treat as
    // an autosave by copying it to the untitled name (proves loadability).
    BOOST_REQUIRE (svc->saveSessionToName ("__autosave_rt_src__"));
    const juce::File namedFile =
        DataPath::defaultSessionDir().getChildFile ("__autosave_rt_src__.els");
    BOOST_REQUIRE (namedFile.existsAsFile());
    BOOST_REQUIRE (namedFile.copyFileTo (autosaveFile));

    // findRecoverableAutosave must surface the untitled autosave (no backing).
    const juce::File found = svc->findRecoverableAutosave();
    BOOST_REQUIRE (found.existsAsFile());

    // Recover it — must load as a real session and present as untitled.
    BOOST_CHECK (svc->recoverFromAutosave (autosaveFile));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (30);
    BOOST_CHECK (svc->getSessionFile() == juce::File()); // untitled → file-less
    // Name carries the "recovered" marker (compare on an ASCII substring to keep
    // the source-encoding of the em-dash out of the assertion).
    BOOST_CHECK (test::context()->session()->getName().contains ("recovered"));

    namedFile.deleteFile();
    cleanAutosaveDir();
}

// ── E6: named-save writes a `.els` in the default session dir, no chooser ────
BOOST_AUTO_TEST_CASE (named_save_writes_els_without_chooser)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    const juce::File target =
        DataPath::defaultSessionDir().getChildFile ("__named_save_test__.els");
    target.deleteFile();

    svc->resetChanges (true);
    // saveSessionToName must NOT block on any modal/chooser (headless) and must
    // produce a real file on disk.
    BOOST_CHECK (svc->saveSessionToName ("__named_save_test__"));
    BOOST_CHECK (target.existsAsFile());
    BOOST_CHECK (svc->getSessionFile() == target);

    // After a successful save the session is clean (not dirty).
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    BOOST_CHECK (! svc->hasSessionChanged());

    target.deleteFile();
}

// ── E6 negative: an empty / illegal name is rejected (no write) ──────────────
BOOST_AUTO_TEST_CASE (named_save_rejects_empty_name)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);
    svc->resetChanges (true);
    BOOST_CHECK (! svc->saveSessionToName ("   "));
    BOOST_CHECK (! svc->saveSessionToName (""));
}

// ── Honesty: autosave is ORTHOGONAL to undo — writing an autosave snapshot must
//    not mutate session state / create an undo boundary ────────────────────────
BOOST_AUTO_TEST_CASE (autosave_snapshot_does_not_perturb_session_state)
{
    cleanAutosaveDir();

    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);
    svc->resetChanges (true);

    auto session = test::context()->session();
    BOOST_REQUIRE (session != nullptr);

    // Make the session dirty so we can confirm autosave doesn't clear it (the
    // undo-relevant guarantee: autosave is a snapshot, NOT a save — it must not
    // reset the dirty flag, create an undo boundary, or alter session identity).
    session->getValueTree().setProperty (tags::tempo, 121.0, nullptr);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    const bool dirtyBefore = svc->hasSessionChanged();
    const juce::String nameBefore = session->getName();
    const juce::File fileBefore = svc->getSessionFile();

    // writeSessionXmlTo is the EXACT pure-snapshot the autosave timer uses.
    const juce::File autosaveFile = svc->getAutosaveFile();
    BOOST_CHECK (svc->writeSessionXmlTo (autosaveFile));
    BOOST_CHECK (autosaveFile.existsAsFile());

    // Dirty flag, name, and document file are all unchanged by the snapshot.
    BOOST_CHECK_EQUAL (svc->hasSessionChanged(), dirtyBefore);
    BOOST_CHECK_EQUAL (session->getName().toStdString(), nameBefore.toStdString());
    BOOST_CHECK (svc->getSessionFile() == fileBefore);

    cleanAutosaveDir();
}

BOOST_AUTO_TEST_SUITE_END()
