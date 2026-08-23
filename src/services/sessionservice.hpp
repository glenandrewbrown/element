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
        file, or a timestamped file in the default session dir when no file is set. */
    File getAutosaveFile() const;

    Signal<void()> sigSessionLoaded;
    Signal<void()> sigWillSave;

private:
    SessionPtr currentSession;
    std::unique_ptr<SessionDocument> document;
    class ChangeResetter;
    std::unique_ptr<ChangeResetter> changeResetter;

    void loadNewSessionData();
    void refreshOtherControllers();

    // juce::Timer callback — runs on the message thread
    void timerCallback() override;
};

} // namespace element
