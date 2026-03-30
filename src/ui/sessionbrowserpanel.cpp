// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/session.hpp>
#include <element/services.hpp>
#include <element/ui.hpp>

#include "services/sessionservice.hpp"
#include "ui/sessionbrowserpanel.hpp"
#include "ui/guicommon.hpp"

namespace element {
using namespace juce;

// ── Color constants (matching plugin browser style) ────────────────────────
namespace ListColors {
    static const Colour rowDefault     { 0xff16191a };
    static const Colour rowHover       { 0xff2a2d2e };
    static const Colour rowSelected    { 0xff4765a0 };
    static const Colour emptyText      { 0xff888888 };
    static const Colour segDefault     { 0xff3b3b3b };
    static const Colour segActive      { 0xff4765a0 };
    static const Colour segTextDefault { 0xffcccccc };
    static const Colour segTextActive  { 0xffffffff };

    // Category dot colors
    static const Colour catSession    { 0xff4fc3f7 };
    static const Colour catGraph      { 0xff81c784 };
    static const Colour catPreset     { 0xffffb74d };
    static const Colour catController { 0xffce93d8 };

    // Row text
    static const Colour nameDefault   { 0xffcccccc };
    static const Colour nameSelected  { 0xffffffff };
    static const Colour metaDefault   { 0xff888888 };
    static const Colour metaSelected  { 0xffdddddd };
} // namespace ListColors

//==============================================================================
// EntryListBoxModel
//==============================================================================

int SessionBrowserPanel::EntryListBoxModel::getNumRows()
{
    return panel.filteredEntries.size();
}

void SessionBrowserPanel::EntryListBoxModel::paintListBoxItem (
    int row, Graphics& g, int w, int h, bool selected)
{
    if (! isPositiveAndBelow (row, panel.filteredEntries.size()))
        return;

    const auto& entry = panel.filteredEntries.getReference (row);

    // Row background
    if (selected)
        g.fillAll (ListColors::rowSelected);

    // ── Line 1: category dot + name ──────────────────────────────────────
    Colour catColour;
    switch (entry.category)
    {
        case FileCategory::Session:    catColour = ListColors::catSession;    break;
        case FileCategory::Graph:      catColour = ListColors::catGraph;      break;
        case FileCategory::Preset:     catColour = ListColors::catPreset;     break;
        case FileCategory::Controller: catColour = ListColors::catController; break;
        default:                       catColour = Colors::textColor.withAlpha (0.3f); break;
    }

    // Category dot: 8x8 circle at x=4, vertically centered in line 1 area (y=4..24)
    const float dotSize = 8.0f;
    const float dotX    = 4.0f;
    const float dotY    = 4.0f + (20.0f - dotSize) / 2.0f; // centered in line 1
    g.setColour (catColour);
    g.fillEllipse (dotX, dotY, dotSize, dotSize);

    // Name: x=16, 14px bold, line 1 area
    const int textLeft = 16;
    g.setColour (selected ? ListColors::nameSelected : ListColors::nameDefault);
    g.setFont (Font (FontOptions (14.f)).boldened());
    g.drawText (entry.name, textLeft, 4, w - textLeft - 8, 20,
                Justification::centredLeft, true);

    // ── Line 2: date + file size / category label ────────────────────────
    g.setColour (selected ? ListColors::metaSelected : ListColors::metaDefault);
    g.setFont (Font (FontOptions (11.f)));

    const auto dateStr = entry.modified.formatted ("%b %d, %H:%M");
    String metaStr = dateStr;

    if (entry.fileSize > 0)
        metaStr += "  |  " + formatFileSize (entry.fileSize);
    else
        metaStr += "  |  " + categoryLabel (entry.category);

    g.drawText (metaStr, textLeft, 22, w - textLeft - 8, 14,
                Justification::centredLeft, true);
}

void SessionBrowserPanel::EntryListBoxModel::listBoxItemDoubleClicked (
    int row, const MouseEvent&)
{
    if (isPositiveAndBelow (row, panel.filteredEntries.size()))
        panel.openEntry (panel.filteredEntries.getReference (row));
}

var SessionBrowserPanel::EntryListBoxModel::getDragSourceDescription (
    const SparseSet<int>& selectedRows)
{
    if (selectedRows.size() == 1)
    {
        const int row = selectedRows[0];
        if (isPositiveAndBelow (row, panel.filteredEntries.size()))
        {
            const auto& entry = panel.filteredEntries.getReference (row);
            var result;
            result.append ("plugin");
            result.append (entry.file.getFullPathName());
            return result;
        }
    }
    return {};
}

void SessionBrowserPanel::EntryListBoxModel::listBoxItemClicked (
    int row, const MouseEvent& e)
{
    if (e.mods.isPopupMenu())
        panel.showContextMenu (row, e);
}

//==============================================================================
// SessionBrowserPanel
//==============================================================================

SessionBrowserPanel::SessionBrowserPanel()
    : model (*this)
{
    addAndMakeVisible (searchBox);
    searchBox.setTextToShowWhenEmpty (TRANS ("Search sessions..."), Colors::textColor.darker());
    searchBox.onTextChange = [this] { startTimer (200); };

    // Segmented control buttons
    addAndMakeVisible (btnAllFiles);
    addAndMakeVisible (btnRecent);

    auto setupButton = [this] (TextButton& btn, ViewMode mode)
    {
        btn.setClickingTogglesState (false);
        btn.onClick = [this, mode]() { setViewMode (mode); };
    };

    setupButton (btnAllFiles, ViewMode::AllFiles);
    setupButton (btnRecent, ViewMode::Recent);
    updateSegmentButtons();

    addAndMakeVisible (listBox);
    listBox.setModel (&model);
    listBox.setRowHeight (40);
    listBox.setColour (ListBox::backgroundColourId, Colours::transparentBlack);

#if JUCE_MAC || JUCE_WINDOWS
    watcher.addFolder (DataPath::defaultSessionDir());
    watcher.addFolder (DataPath::defaultGraphDir());
    watcher.addListener (this);
#endif

    loadRecentFiles();
    scanDirectory();
}

SessionBrowserPanel::~SessionBrowserPanel()
{
#if JUCE_MAC || JUCE_WINDOWS
    watcher.removeListener (this);
    watcher.removeAllFolders();
#endif
    listBox.setModel (nullptr);
}

void SessionBrowserPanel::resized()
{
    auto r = getLocalBounds().reduced (2);
    auto top = r.removeFromTop (22);
    searchBox.setBounds (top);
    r.removeFromTop (4);

    auto segArea = r.removeFromTop (20);
    int segW = segArea.getWidth() / 2;
    btnAllFiles.setBounds (segArea.removeFromLeft (segW));
    btnRecent.setBounds (segArea);

    r.removeFromTop (4);
    listBox.setBounds (r);
}

void SessionBrowserPanel::paint (Graphics& g)
{
    // Empty state when no entries match
    if (filteredEntries.isEmpty() && listBox.isVisible())
    {
        auto contentArea = getLocalBounds().reduced (2);
        // Skip past search (22) + gap (4) + segment (20) + gap (4)
        contentArea.removeFromTop (50);

        g.setColour (ListColors::emptyText);
        g.setFont (Font (FontOptions (14.f)));

        String emptyText;
        if (viewMode == ViewMode::Recent)
            emptyText = "No recently opened sessions.";
        else
            emptyText = "No sessions found.\nCreate one from File > Save Session.";

        g.drawFittedText (emptyText, contentArea, Justification::centred, 2);
    }
}

void SessionBrowserPanel::refresh()
{
    if (viewMode == ViewMode::AllFiles)
        scanDirectory();
    else
        buildRecentEntries();
}

void SessionBrowserPanel::timerCallback()
{
    stopTimer();
    applyFilter();
}

//==============================================================================
// View mode switching
//==============================================================================

void SessionBrowserPanel::setViewMode (ViewMode mode)
{
    if (viewMode == mode)
        return;
    viewMode = mode;
    updateSegmentButtons();

    if (viewMode == ViewMode::AllFiles)
        scanDirectory();
    else
        buildRecentEntries();
}

void SessionBrowserPanel::updateSegmentButtons()
{
    styleSegmentButton (btnAllFiles, viewMode == ViewMode::AllFiles);
    styleSegmentButton (btnRecent, viewMode == ViewMode::Recent);
}

void SessionBrowserPanel::styleSegmentButton (TextButton& btn, bool active)
{
    btn.setColour (TextButton::buttonColourId,
                   active ? ListColors::segActive : ListColors::segDefault);
    btn.setColour (TextButton::buttonOnColourId, ListColors::segActive);
    btn.setColour (TextButton::textColourOffId,
                   active ? ListColors::segTextActive : ListColors::segTextDefault);
    btn.setColour (TextButton::textColourOnId, ListColors::segTextActive);
}

//==============================================================================
// Scanning (All Files mode)
//==============================================================================

void SessionBrowserPanel::scanDirectory()
{
    allEntries.clearQuick();

    auto addFilesFrom = [this] (const File& dir, bool recursive)
    {
        if (! dir.isDirectory())
            return;

        for (const auto& entry :
             RangedDirectoryIterator (dir, recursive, "*.els;*.elg;*.eln;*.elpreset;*.elc",
                                     File::findFiles))
        {
            const auto file = entry.getFile();
            FileEntry fe;
            fe.file     = file;
            fe.name     = file.getFileNameWithoutExtension();
            fe.modified = file.getLastModificationTime();
            fe.category = categoryFromExtension (file.getFileExtension().toLowerCase());
            fe.fileSize = file.getSize();
            allEntries.add (fe);
        }
    };

    addFilesFrom (DataPath::defaultSessionDir(), true);
    addFilesFrom (DataPath::defaultGraphDir(), true);
    addFilesFrom (DataPath::defaultControllersDir(), true);

    // Also look in the user data root for loose .els/.elg files
    const auto userRoot = DataPath::defaultLocation();
    for (const auto& entry :
         RangedDirectoryIterator (userRoot, false, "*.els;*.elg", File::findFiles))
    {
        const auto file = entry.getFile();
        // Skip if already found from subdirectories
        bool duplicate = false;
        for (const auto& existing : allEntries)
        {
            if (existing.file == file)
            {
                duplicate = true;
                break;
            }
        }
        if (duplicate)
            continue;

        FileEntry fe;
        fe.file     = file;
        fe.name     = file.getFileNameWithoutExtension();
        fe.modified = file.getLastModificationTime();
        fe.category = categoryFromExtension (file.getFileExtension().toLowerCase());
        fe.fileSize = file.getSize();
        allEntries.add (fe);
    }

    // Sort by date modified, most recent first
    std::sort (allEntries.begin(), allEntries.end(),
               [] (const FileEntry& a, const FileEntry& b)
               { return a.modified > b.modified; });

    applyFilter();
}

//==============================================================================
// Filter
//==============================================================================

void SessionBrowserPanel::applyFilter()
{
    if (viewMode == ViewMode::Recent)
    {
        // buildRecentEntries handles filtering, updateContent, and repaint
        buildRecentEntries();
        return;
    }

    // All Files mode: filter allEntries by search text only
    filteredEntries.clearQuick();
    const auto text = searchBox.getText().trim();

    for (const auto& entry : allEntries)
    {
        if (text.isNotEmpty() && ! entry.name.containsIgnoreCase (text))
            continue;
        filteredEntries.add (entry);
    }

    listBox.updateContent();
    listBox.repaint();
    repaint(); // for empty state
}

//==============================================================================
// Open / Context Menu
//==============================================================================

void SessionBrowserPanel::openEntry (const FileEntry& entry)
{
    auto* cc = ViewHelpers::findContentComponent (this);
    if (! cc)
        return;

    if (entry.file.hasFileExtension ("els") || entry.file.hasFileExtension ("elg"))
    {
        recordRecentOpen (entry.file);
        cc->post (new OpenSessionMessage (entry.file));
    }
    else if (entry.file.hasFileExtension ("eln") || entry.file.hasFileExtension ("elpreset"))
    {
        auto session = ViewHelpers::getSession (this);
        if (session)
        {
            const Node node (Node::parse (entry.file), false);
            if (node.isValid())
                cc->post (new AddNodeMessage (node, session->getActiveGraph()));
        }
    }
}

void SessionBrowserPanel::showContextMenu (int row, const MouseEvent&)
{
    if (! isPositiveAndBelow (row, filteredEntries.size()))
        return;

    const auto& entry = filteredEntries.getReference (row);
    PopupMenu menu;
    menu.addItem (1, "Open");
    menu.addItem (2, "Show in Finder");
    menu.addSeparator();
    menu.addItem (3, "Delete");

    const int result = menu.show();
    switch (result)
    {
        case 1:
            openEntry (entry);
            break;
        case 2:
            entry.file.revealToUser();
            break;
        case 3:
        {
#if JUCE_WINDOWS
            String msg ("Would you like to move this file to the Recycle Bin?\n");
#else
            String msg ("Would you like to move this file to the trash?\n\n");
#endif
            msg << entry.file.getFullPathName();
            if (AlertWindow::showOkCancelBox (AlertWindow::QuestionIcon, "Delete file", msg))
            {
                if (entry.file.deleteFile())
                    scanDirectory();
                else
                    AlertWindow::showMessageBoxAsync (AlertWindow::WarningIcon,
                                                     "Delete file", "Could not delete");
            }
            break;
        }
        default:
            break;
    }
}

//==============================================================================
// Recently opened tracking
//==============================================================================

void SessionBrowserPanel::recordRecentOpen (const File& file)
{
    const auto path = file.getFullPathName();

    // Remove existing entry if present (move to front)
    const int idx = recentPaths.indexOf (path);
    if (idx >= 0)
    {
        recentPaths.remove (idx);
        recentTimes.remove (idx);
    }

    // Add to front
    recentPaths.insert (0, path);
    recentTimes.insert (0, Time::getCurrentTime());

    // Trim to max
    while (recentPaths.size() > maxRecentEntries)
    {
        recentPaths.remove (recentPaths.size() - 1);
        recentTimes.remove (recentTimes.size() - 1);
    }

    saveRecentFiles();

    // If currently in Recent view, refresh display
    if (viewMode == ViewMode::Recent)
        buildRecentEntries();
}

File SessionBrowserPanel::getRecentFilePath() const
{
    return File::getSpecialLocation (File::userApplicationDataDirectory)
        .getChildFile ("Element")
        .getChildFile ("recent_sessions.xml");
}

void SessionBrowserPanel::loadRecentFiles()
{
    recentPaths.clear();
    recentTimes.clear();

    const auto xmlFile = getRecentFilePath();
    if (! xmlFile.existsAsFile())
        return;

    auto xml = parseXML (xmlFile);
    if (xml == nullptr || ! xml->hasTagName ("RecentSessions"))
        return;

    for (auto* child : xml->getChildIterator())
    {
        if (! child->hasTagName ("Entry"))
            continue;

        const auto path = child->getStringAttribute ("path");
        const auto timeMs = child->getStringAttribute ("time").getLargeIntValue();

        if (path.isNotEmpty())
        {
            recentPaths.add (path);
            recentTimes.add (Time (timeMs));
        }
    }
}

void SessionBrowserPanel::saveRecentFiles()
{
    auto xml = std::make_unique<XmlElement> ("RecentSessions");

    for (int i = 0; i < recentPaths.size(); ++i)
    {
        auto* entry = xml->createNewChildElement ("Entry");
        entry->setAttribute ("path", recentPaths[i]);
        entry->setAttribute ("time", String (recentTimes[i].toMilliseconds()));
    }

    const auto xmlFile = getRecentFilePath();
    xmlFile.getParentDirectory().createDirectory();
    xml->writeTo (xmlFile, {});
}

void SessionBrowserPanel::buildRecentEntries()
{
    filteredEntries.clearQuick();

    for (int i = 0; i < recentPaths.size(); ++i)
    {
        const File file (recentPaths[i]);
        if (! file.existsAsFile())
            continue;

        FileEntry fe;
        fe.file     = file;
        fe.name     = file.getFileNameWithoutExtension();
        fe.modified = (i < recentTimes.size()) ? recentTimes[i] : file.getLastModificationTime();
        fe.category = categoryFromExtension (file.getFileExtension().toLowerCase());
        fe.fileSize = file.getSize();
        filteredEntries.add (fe);
    }

    // Apply search filter if text is present
    const auto text = searchBox.getText().trim();
    if (text.isNotEmpty())
    {
        for (int i = filteredEntries.size(); --i >= 0;)
        {
            if (! filteredEntries.getReference (i).name.containsIgnoreCase (text))
                filteredEntries.remove (i);
        }
    }

    listBox.updateContent();
    listBox.repaint();
    repaint(); // for empty state
}

//==============================================================================
// Helpers
//==============================================================================

SessionBrowserPanel::FileCategory
SessionBrowserPanel::categoryFromExtension (const String& ext)
{
    if (ext == ".els") return FileCategory::Session;
    if (ext == ".elg") return FileCategory::Graph;
    if (ext == ".eln" || ext == ".elpreset") return FileCategory::Preset;
    if (ext == ".elc") return FileCategory::Controller;
    return FileCategory::Unknown;
}

String SessionBrowserPanel::categoryLabel (FileCategory cat)
{
    switch (cat)
    {
        case FileCategory::Session:    return "Session";
        case FileCategory::Graph:      return "Graph";
        case FileCategory::Preset:     return "Preset";
        case FileCategory::Controller: return "Controller";
        default:                       return "Other";
    }
}

String SessionBrowserPanel::formatFileSize (int64 bytes)
{
    if (bytes < 1024)
        return String (bytes) + " B";
    if (bytes < 1024 * 1024)
        return String (bytes / 1024) + " KB";

    const double mb = static_cast<double> (bytes) / (1024.0 * 1024.0);
    return String (mb, 1) + " MB";
}

} // namespace element
