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

    if (selected)
        g.fillAll (Colors::toggleBlue.withAlpha (0.3f));

    // Icon / category indicator
    const int iconWidth = 6;
    Colour catColour;
    switch (entry.category)
    {
        case FileCategory::Session:    catColour = Colour (0xff4fc3f7); break; // light blue
        case FileCategory::Graph:      catColour = Colour (0xff81c784); break; // green
        case FileCategory::Preset:     catColour = Colour (0xffffb74d); break; // orange
        case FileCategory::Controller: catColour = Colour (0xffce93d8); break; // purple
        default:                       catColour = Colors::textColor.withAlpha (0.3f); break;
    }
    g.setColour (catColour);
    g.fillRoundedRectangle (4.f, (h - 12.f) / 2.f, (float) iconWidth, 12.f, 2.f);

    // Name
    const int textLeft = iconWidth + 10;
    g.setColour (Colors::textColor);
    g.setFont (Font (FontOptions (13.f)));
    g.drawText (entry.name, textLeft, 0, w - textLeft - 90, h, Justification::centredLeft, true);

    // Date
    g.setColour (Colors::textColor.withAlpha (0.5f));
    g.setFont (Font (FontOptions (11.f)));
    const auto dateStr = entry.modified.formatted ("%b %d, %H:%M");
    g.drawText (dateStr, w - 88, 0, 84, h, Justification::centredRight, true);
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

    addAndMakeVisible (categoryFilter);
    categoryFilter.addItem ("All", 1);
    categoryFilter.addItem ("Sessions", 2);
    categoryFilter.addItem ("Graphs", 3);
    categoryFilter.addItem ("Presets", 4);
    categoryFilter.addItem ("Controllers", 5);
    categoryFilter.setSelectedId (1, dontSendNotification);
    categoryFilter.onChange = [this] { applyFilter(); };

    addAndMakeVisible (listBox);
    listBox.setModel (&model);
    listBox.setRowHeight (28);
    listBox.setColour (ListBox::backgroundColourId, Colours::transparentBlack);

#if JUCE_MAC || JUCE_WINDOWS
    watcher.addFolder (DataPath::defaultSessionDir());
    watcher.addFolder (DataPath::defaultGraphDir());
    watcher.addListener (this);
#endif

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
    auto top = r.removeFromTop (24);
    searchBox.setBounds (top.removeFromLeft (top.getWidth() * 2 / 3).reduced (0, 1));
    categoryFilter.setBounds (top.reduced (2, 1));
    r.removeFromTop (2);
    listBox.setBounds (r);
}

void SessionBrowserPanel::paint (Graphics&) {}

void SessionBrowserPanel::refresh()
{
    scanDirectory();
}

void SessionBrowserPanel::timerCallback()
{
    stopTimer();
    applyFilter();
}

//==============================================================================
// Scanning
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
        allEntries.add (fe);
    }

    // Sort by date modified, most recent first
    std::sort (allEntries.begin(), allEntries.end(),
               [] (const FileEntry& a, const FileEntry& b)
               { return a.modified > b.modified; });

    applyFilter();
}

void SessionBrowserPanel::applyFilter()
{
    filteredEntries.clearQuick();

    const auto text = searchBox.getText().trim();
    const int catId = categoryFilter.getSelectedId();

    FileCategory catFilter = FileCategory::Unknown;
    switch (catId)
    {
        case 2: catFilter = FileCategory::Session; break;
        case 3: catFilter = FileCategory::Graph; break;
        case 4: catFilter = FileCategory::Preset; break;
        case 5: catFilter = FileCategory::Controller; break;
        default: break; // All
    }

    for (const auto& entry : allEntries)
    {
        if (catFilter != FileCategory::Unknown && entry.category != catFilter)
            continue;
        if (text.isNotEmpty() && ! entry.name.containsIgnoreCase (text))
            continue;
        filteredEntries.add (entry);
    }

    listBox.updateContent();
    listBox.repaint();
}

void SessionBrowserPanel::openEntry (const FileEntry& entry)
{
    auto* cc = ViewHelpers::findContentComponent (this);
    if (! cc)
        return;

    if (entry.file.hasFileExtension ("els") || entry.file.hasFileExtension ("elg"))
    {
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

} // namespace element
