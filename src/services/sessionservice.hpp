// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/services.hpp>
#include <element/session.hpp>
#include <element/signals.hpp>

#include "ui/sessiondocument.hpp"

namespace element {
class SessionService : public Service,
                       private juce::Timer
{
public:
    SessionService();
    ~SessionService();

    void activate() override;
    void deactivate() override;

    void openDefaultSession();
    void openFile (const File& file);
    const File getSessionFile() const;
    void closeSession();
    void saveSession (const bool saveAs = false,
                      const bool askForFile = true,
                      const bool showError = true);

    /** Save the current session to `<defaultSessionDir>/<name>.els` WITHOUT any
        FileChooser (E6 — named-save). Bypasses the interactive FileBasedDocument
        save-as path: sets the document file and saves directly. `name` is
        sanitised to a safe filename; an empty/invalid name is rejected.
        @returns true on a successful write. */
    bool saveSessionToName (const String& name);

    void newSession();
    bool hasSessionChanged();

    void resetChanges (const bool clearDocumentFile = false);

    void exportGraph (const Node& node, const File& targetFile);
    void importGraph (const File& file);

    /** Start the autosave timer. Must be called on the message thread.
        @param intervalSeconds  How often to write the autosave file (default 60). */
    void startAutosave (int intervalSeconds = 60);

    /** Stop the autosave timer. */
    void stopAutosave();

    /** Returns the autosave file that would be written next to the current session
        file, or a timestamped file in the default session dir when no file is set.
        The autosave file is always a SESSION-format `.els` file (E1) so it can be
        loaded back through the normal session-open path. */
    File getAutosaveFile() const;

    /** Serialise the current session to `target` as session XML, WITHOUT changing
        the document file or dirty flag. This is the exact pure-snapshot the
        autosave timer uses — exposed so a test can assert autosave is orthogonal
        to undo / session state. */
    bool writeSessionXmlTo (const File& target) const;

    /** Scan the default session dir for the newest recoverable autosave that is
        STRICTLY NEWER than its backing session file (untitled `autosave_*.els`
        files have no backing file and always qualify). Returns an invalid File
        when nothing is recoverable. Pure query — performs no load. */
    File findRecoverableAutosave() const;

    /** Load a recoverable autosave file as a real session (the `.els` path
        through SessionDocument). Returns true on success. For an untitled
        autosave the session presents as "Untitled — recovered" and the document
        is left file-less so the next save prompts for a name. */
    bool recoverFromAutosave (const File& autosaveFile);

    /** Wall-clock time (ms since epoch) of the most recent successful save or
        autosave, or 0 if none yet this session. Surfaced in the session snapshot
        so the webview can fire a non-modal save-pulse (G3) when it changes —
        works for silent saves AND autosaves without a separate JS push. */
    juce::int64 getLastSavedMs() const noexcept { return lastSavedMs; }

    Signal<void()> sigSessionLoaded;
    Signal<void()> sigWillSave;

    /** Fired after a successful autosave or silent save write. The argument is a
        short kind string ("autosave" | "save") so a non-modal UI cue (G3) can
        distinguish the source. Never fires on a failed or cancelled save. */
    Signal<void (const String&)> sigSaved;

private:
    SessionPtr currentSession;
    std::unique_ptr<SessionDocument> document;
    class ChangeResetter;
    std::unique_ptr<ChangeResetter> changeResetter;

    /** Set to now() each time a save / autosave succeeds (G3 cue source). */
    juce::int64 lastSavedMs = 0;

    void loadNewSessionData();
    void refreshOtherControllers();

    // juce::Timer callback — runs on the message thread
    void timerCallback() override;
};

} // namespace element
