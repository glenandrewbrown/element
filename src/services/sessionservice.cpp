// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/graph.hpp>
#include <element/node.hpp>
#include <element/context.hpp>
#include <element/settings.hpp>
#include <element/services.hpp>
#include <element/engine.hpp>
#include <element/ui.hpp>
#include <element/ui/content.hpp>

#include "services/deviceservice.hpp"
#include "services/mappingservice.hpp"
#include "services/presetservice.hpp"
#include "services/sessionservice.hpp"

namespace element {

class SessionService::ChangeResetter : public AsyncUpdater
{
public:
    explicit ChangeResetter (SessionService& sc) : owner (sc) {}
    ~ChangeResetter() = default;

    void handleAsyncUpdate() override
    {
        owner.resetChanges (false);
        jassert (! owner.hasSessionChanged());
    }

private:
    SessionService& owner;
};

SessionService::SessionService() {}
SessionService::~SessionService() {}

void SessionService::activate()
{
    currentSession = context().session();
    document.reset (new SessionDocument (currentSession));
    changeResetter.reset (new ChangeResetter (*this));
    document->setFile (DataPath::defaultSessionDir());
    startAutosave();
}

void SessionService::deactivate()
{
    stopAutosave();

    auto& world = context();
    auto& settings (world.settings());
    auto* props = settings.getUserSettings();

    if (document)
    {
        if (document->getFile().existsAsFile())
            props->setValue (Settings::lastSessionKey, document->getFile().getFullPathName());
        document = nullptr;
    }

    if (changeResetter)
        changeResetter->cancelPendingUpdate();
    changeResetter.reset (nullptr);

    currentSession->clear();
    currentSession = nullptr;
}

void SessionService::openDefaultSession()
{
    if (auto* gc = sibling<GuiService>())
        gc->closeAllPluginWindows();

    loadNewSessionData();
    refreshOtherControllers();
    if (auto* gui = sibling<GuiService>())
        gui->stabilizeContent();
    resetChanges (true);
}

void SessionService::openFile (const File& file)
{
    bool didSomething = true;

    if (file.hasFileExtension ("elg"))
    {
        ValueTree data (Node::parse (file));
        String error;

        if (Node::isProbablyGraphNode (data))
        {
            Model model (data);

            if (model.version() != EL_GRAPH_VERSION)
                data = Node::migrate (model.data(), error);

            if (data.isValid() && error.isEmpty())
            {
                Node node (data, true);
                node.forEach ([] (const ValueTree& tree) {
                    if (! tree.hasType (types::Node))
                        return;
                    auto ref = tree;
                    ref.setProperty (tags::uuid, Uuid().toString(), nullptr);
                });

                if (auto* ec = sibling<EngineService>())
                    ec->addGraph (node, false);
            }
        }
        else
        {
            error = "File does not seem to be an Element graph.";
        }

        if (error.isNotEmpty())
        {
            AlertWindow::showMessageBoxAsync (AlertWindow::WarningIcon, "Invalid graph", error);
        }
    }
    else if (file.hasFileExtension ("els"))
    {
        // Check whether a newer autosave exists and log it for the user. E1: the
        // autosave sibling is now a `.els` (session format), recoverable via the
        // recovery loader / recall shelf.
        {
            const File autosaveFile = file.getSiblingFile (
                file.getFileNameWithoutExtension() + ".autosave.els");
            if (autosaveFile.existsAsFile() && autosaveFile.getLastModificationTime() > file.getLastModificationTime())
                DBG ("[SessionService] autosave available: " + autosaveFile.getFullPathName());
        }

        document->saveIfNeededAndUserAgrees();
        Session::ScopedFrozenLock freeze (*currentSession);
        Result result = document->loadFrom (file, true);

        if (result.wasOk())
        {
            if (auto* gui = sibling<GuiService>())
            {
                gui->closeAllPluginWindows();
                refreshOtherControllers();

                if (auto* cc = gui->content())
                {
                    auto ui = currentSession->data().getOrCreateChildWithName (tags::ui, nullptr);
                    cc->applySessionState (ui.getProperty ("content").toString());
                }

                gui->stabilizeContent();
            }
            else
            {
                refreshOtherControllers();
            }

            resetChanges();
        }

        jassert (! hasSessionChanged());
    }
    else
    {
        didSomething = false;
    }

    if (didSomething)
    {
        if (auto* gc = sibling<GuiService>())
            if (! file.hasFileExtension ("els"))
                gc->stabilizeContent();
        changeResetter->triggerAsyncUpdate();
    }
}

const File SessionService::getSessionFile() const {
    return document != nullptr ? document->getFile() : File();
}

void SessionService::exportGraph (const Node& node, const File& targetFile)
{
    if (! node.hasNodeType (types::Graph))
    {
        jassertfalse;
        return;
    }

    TemporaryFile tempFile (targetFile);
    if (node.writeToFile (tempFile.getFile()))
        tempFile.overwriteTargetFileWithTemporary();
}

void SessionService::importGraph (const File& file)
{
    openFile (file);
}

void SessionService::closeSession()
{
    DBG ("[SC] close session");
}

bool SessionService::hasSessionChanged() {
    return (document) ? document->hasChangedSinceSaved() : false;
}

void SessionService::resetChanges (const bool resetDocumentFile)
{
    jassert (document);
    if (resetDocumentFile)
        document->setFile ({});
    document->setChangedFlag (false);
    jassert (! document->hasChangedSinceSaved());
}

void SessionService::saveSession (const bool saveAs, const bool askForFile, const bool showError)
{
    jassert (document && currentSession);
    auto result = FileBasedDocument::userCancelledSave;

    auto* gui = sibling<GuiService>();
    if (! gui)
        return;

    if (auto* cc = gui->content())
    {
        String state;
        cc->getSessionState (state);
        auto ui = currentSession->data().getOrCreateChildWithName (tags::ui, nullptr);
        ui.setProperty ("content", state, nullptr);
    }

    sigWillSave();

    if (saveAs)
    {
        result = document->saveAsInteractive (true);
    }
    else
    {
        result = document->save (askForFile, showError);
    }

    if (result == FileBasedDocument::userCancelledSave)
        return;

    if (result == FileBasedDocument::savedOk)
    {
        // ensure change messages are flushed so the changed flag doesn't reset
        currentSession->dispatchPendingMessages();
        document->setChangedFlag (false);
        jassert (! hasSessionChanged());
        if (auto* us = context().settings().getUserSettings())
            us->setValue (Settings::lastSessionKey, document->getFile().getFullPathName());

        if (saveAs)
        {
            if (auto* ui = sibling<UI>())
                ui->recentFiles().addFile (document->getFile());
            currentSession->data().setProperty (tags::name,
                                                document->getFile().getFileNameWithoutExtension(),
                                                nullptr);
        }

        // G3 — fire the non-modal save cue for any successful save (silent or
        // explicit). The autosave path fires its own "autosave" kind.
        lastSavedMs = Time::getCurrentTime().toMilliseconds();
        sigSaved ("save");
    }
}

bool SessionService::saveSessionToName (const String& name)
{
    jassert (document && currentSession);

    // E6: silent named-save with NO FileChooser. Sanitise the name to a safe
    // filename, target <defaultSessionDir>/<name>.els, set the document file and
    // save directly (the interactive saveAs path is bypassed entirely).
    const String safe = File::createLegalFileName (name).trim();
    if (safe.isEmpty())
        return false;

    auto* gui = sibling<GuiService>();
    if (gui == nullptr)
        return false;

    // Flush the editor's UI layout state into the session tree first (same as
    // saveSession), so the named save captures the full project.
    if (auto* cc = gui->content())
    {
        String state;
        cc->getSessionState (state);
        auto ui = currentSession->data().getOrCreateChildWithName (tags::ui, nullptr);
        ui.setProperty ("content", state, nullptr);
    }

    sigWillSave();

    const File dir = DataPath::defaultSessionDir();
    dir.createDirectory();
    const File target = dir.getChildFile (safe).withFileExtension ("els");

    // Snapshot pre-mutation state so we can roll back on failure.
    const String oldName = currentSession->data().getProperty (tags::name, "").toString();
    const File oldFile   = document->getFile();

    // Adopt the session name + file BEFORE the save + clean-flag, so the
    // name-change that the save persists doesn't re-dirty the document afterwards
    // (a freshly-named-saved project must read as clean).
    currentSession->data().setProperty (tags::name, target.getFileNameWithoutExtension(), nullptr);
    document->setFile (target);

    const auto result = document->save (false, true); // askForFile=false → no chooser

    if (result != FileBasedDocument::savedOk)
    {
        // Roll back: restore name and document path so the session is not left
        // pointing at a file that was never written.
        currentSession->data().setProperty (tags::name, oldName, nullptr);
        document->setFile (oldFile);
        return false;
    }

    currentSession->dispatchPendingMessages();
    document->setChangedFlag (false);
    if (auto* us = context().settings().getUserSettings())
        us->setValue (Settings::lastSessionKey, target.getFullPathName());
    if (auto* ui = sibling<UI>())
        ui->recentFiles().addFile (target);

    lastSavedMs = Time::getCurrentTime().toMilliseconds();
    sigSaved ("save");
    return true;
}

void SessionService::newSession()
{
    jassert (document && currentSession);
    // - 0 if the third button was pressed ('cancel')
    // - 1 if the first button was pressed ('yes')
    // - 2 if the middle button was pressed ('no')
    int res = 2;
    if (document->hasChangedSinceSaved())
        res = AlertWindow::showYesNoCancelBox (AlertWindow::InfoIcon,
                                               "Save Project?",
                                               "The current project has changes. Would you like to save it?",
                                               "Save Project",
                                               "Don't Save",
                                               "Cancel");
    if (res == 1)
        document->save (true, true);

    if (res == 1 || res == 2)
    {
        if (auto* gc = sibling<GuiService>())
            gc->closeAllPluginWindows();
        loadNewSessionData();
        refreshOtherControllers();
        if (auto* gc = sibling<GuiService>())
            gc->stabilizeContent();
        resetChanges (true);
    }
}

void SessionService::loadNewSessionData()
{
    currentSession->clear();
    const auto file = context().settings().getDefaultNewSessionFile();
    bool wasLoaded = false;

    if (file.existsAsFile())
    {
        ValueTree data;
        if (auto xml = XmlDocument::parse (file))
            data = ValueTree::fromXml (*xml);
        if (data.isValid() && data.hasType (types::Session) && EL_SESSION_VERSION == (int) data.getProperty (tags::version))
            wasLoaded = currentSession->loadData (data);
    }

    if (! wasLoaded)
    {
        auto engine = context().audio();
        int fallbackCount = 2;
        int numIn = engine != nullptr ? engine->getNumChannels (true) : fallbackCount;
        int numOut = engine != nullptr ? engine->getNumChannels (false) : fallbackCount;
        currentSession->clear();
        currentSession->addGraph (
            Graph::create ("Board", numIn, numOut, true, true),
            true);
    }
}

void SessionService::refreshOtherControllers()
{
    if (auto* es = sibling<EngineService>())
        es->sessionReloaded();
    if (auto* ds = sibling<DeviceService>())
        ds->refresh();
    if (auto* ms = sibling<MappingService>())
        ms->learn (false);
    if (auto* ps = sibling<PresetService>())
        ps->refresh();
    sigSessionLoaded();
}

void SessionService::startAutosave (int intervalSeconds)
{
    const int ms = jmax (1, intervalSeconds) * 1000;
    startTimer (ms);
}

void SessionService::stopAutosave()
{
    stopTimer();
}

File SessionService::getAutosaveFile() const
{
    // E1 (Codex): autosave files MUST be session-format `.els`, never `.elg`.
    // openFile()/elementSessionOpenPath only load `.els` as a session — a `.elg`
    // autosave would be unrecoverable (treated as a graph import). A saved
    // session writes a sibling `<name>.autosave.els`; a never-saved session
    // writes a timestamped `autosave_<ts>.els` in the default session dir
    // (Glen Q4 — an untitled session must still be restorable).
    const File sessionFile = getSessionFile();
    if (sessionFile.existsAsFile())
        return sessionFile.getSiblingFile (
            sessionFile.getFileNameWithoutExtension() + ".autosave.els");

    // No file set yet — use a timestamped name in the default session dir.
    const String timestamp = Time::getCurrentTime().formatted ("%Y%m%d_%H%M%S");
    return DataPath::defaultSessionDir().getChildFile ("autosave_" + timestamp + ".els");
}

File SessionService::findRecoverableAutosave() const
{
    const File dir = DataPath::defaultSessionDir();
    if (! dir.isDirectory())
        return {};

    const String autosaveSuffix (".autosave.els");

    File newest;
    Time newestTime;

    for (const auto& entry :
         RangedDirectoryIterator (dir, false, "*.autosave.els;autosave_*.els", File::findFiles))
    {
        const File f = entry.getFile();
        const Time mod = f.getLastModificationTime();
        const String fname = f.getFileName();

        // A `<name>.autosave.els` is only recoverable when it is STRICTLY newer
        // than its backing `<name>.els` (otherwise the saved file already has
        // the latest work). An untitled `autosave_*.els` has no backing file and
        // always qualifies.
        if (fname.endsWith (autosaveSuffix))
        {
            const File backing = f.getSiblingFile (
                fname.dropLastCharacters (autosaveSuffix.length()) + ".els");
            if (backing.existsAsFile() && backing.getLastModificationTime() >= mod)
                continue;
        }

        if (newest == File() || mod > newestTime)
        {
            newest = f;
            newestTime = mod;
        }
    }

    return newest;
}

bool SessionService::recoverFromAutosave (const File& autosaveFile)
{
    jassert (document && currentSession);
    if (! autosaveFile.existsAsFile())
        return false;

    if (auto* gc = sibling<GuiService>())
        gc->closeAllPluginWindows();

    bool ok = false;
    {
        Session::ScopedFrozenLock freeze (*currentSession);
        const Result result = document->loadFrom (autosaveFile, false);
        ok = result.wasOk();
    }

    if (! ok)
        return false;

    const String fname = autosaveFile.getFileName();
    const bool untitled = fname.startsWith ("autosave_");

    if (untitled)
    {
        // Recovered work that was never named: keep the document file-less so the
        // next save prompts for a name, and surface it as "Untitled — recovered".
        document->setFile ({});
        currentSession->data().setProperty (tags::name, "Untitled — recovered", nullptr);
    }
    else
    {
        // A `<name>.autosave.els` belongs to `<name>.els` — adopt the real file
        // so a subsequent save overwrites it (not the autosave sibling).
        const String autosaveSuffix (".autosave.els");
        const File backing = autosaveFile.getSiblingFile (
            fname.dropLastCharacters (autosaveSuffix.length()) + ".els");
        document->setFile (backing);
    }

    if (auto* gui = sibling<GuiService>())
    {
        refreshOtherControllers();
        if (auto* cc = gui->content())
        {
            auto ui = currentSession->data().getOrCreateChildWithName (tags::ui, nullptr);
            cc->applySessionState (ui.getProperty ("content").toString());
        }
        gui->stabilizeContent();
    }
    else
    {
        refreshOtherControllers();
    }

    // Recovered content is unsaved-to-its-real-file work: mark dirty so the user
    // is nudged to save, and so the autosave loop keeps protecting it.
    document->setChangedFlag (true);
    return true;
}

bool SessionService::writeSessionXmlTo (const File& target) const
{
    if (currentSession == nullptr)
        return false;

    // Mirror SessionDocument::saveDocument — flush graph state, serialise the
    // session ValueTree to XML, write it. This is a PURE SNAPSHOT: it does not
    // touch the document's current file or dirty flag (autosave is orthogonal to
    // undo — honesty note in §4b).
    currentSession->saveGraphState();
    if (auto xml = currentSession->createXml())
    {
        target.getParentDirectory().createDirectory();
        return xml->writeTo (target);
    }
    return false;
}

void SessionService::timerCallback()
{
    if (! hasSessionChanged())
        return;

    // E1: autosave fires even when the session has never been saved to disk
    // (the `! sessionFile.existsAsFile()` early-return is gone). A never-saved
    // session is snapshotted to a timestamped `autosave_<ts>.els` so an untitled
    // session is fully recoverable (Glen Q4). Write session XML directly so the
    // recovery file is a real, loadable `.els` (never a `.elg` graph-import).
    const File autosaveFile = getAutosaveFile();
    if (writeSessionXmlTo (autosaveFile))
    {
        lastSavedMs = Time::getCurrentTime().toMilliseconds();
        sigSaved ("autosave");
    }
    else
        DBG ("[SessionService] autosave write failed: " + autosaveFile.getFullPathName());
}

} // namespace element
