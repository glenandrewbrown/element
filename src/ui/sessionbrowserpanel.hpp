// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/gui_basics.hpp>
#include <element/datapath.hpp>
#include <element/ui/content.hpp>

#include "filesystemwatcher.hpp"
#include "messages.hpp"
#include "ui/viewhelpers.hpp"

namespace element {

/** A panel that shows saved sessions, graphs, and presets with a segmented
    "All Files" / "Recent" view selector, two-line rows, search filtering,
    and empty state.  Lives in the navigation concertina. */
class SessionBrowserPanel : public juce::Component,
                            public juce::Timer,
                            public FileSystemWatcher::Listener
{
public:
    SessionBrowserPanel();
    ~SessionBrowserPanel() override;

    void resized() override;
    void paint (juce::Graphics&) override;
    void mouseMove (const juce::MouseEvent&) override;
    void mouseExit (const juce::MouseEvent&) override;

    /** Refresh the file list from disk. */
    void refresh();

    /** Record that a session file was opened so it appears in the Recent tab.
        Known limitation: only .els session loads are tracked. Graph imports
        (.elg) and plugin-mode DAW state restores are not tracked (no file
        path available). */
    void recordRecentOpen (const juce::File& file);

private:
    //==========================================================================
    enum class FileCategory
    {
        Session,
        Graph,
        Preset,
        Controller,
        Unknown
    };

    struct FileEntry
    {
        juce::File file;
        juce::String name;
        juce::Time modified;
        FileCategory category = FileCategory::Unknown;
        juce::int64 fileSize  = 0;
    };

    enum class ViewMode
    {
        AllFiles,
        Recent
    };

    //==========================================================================
    class EntryListBoxModel : public juce::ListBoxModel
    {
    public:
        explicit EntryListBoxModel (SessionBrowserPanel& owner) : panel (owner) {}

        int getNumRows() override;
        void paintListBoxItem (int row, juce::Graphics& g, int w, int h, bool selected) override;
        void listBoxItemDoubleClicked (int row, const juce::MouseEvent&) override;
        juce::var getDragSourceDescription (const juce::SparseSet<int>& selectedRows) override;
        void listBoxItemClicked (int row, const juce::MouseEvent& e) override;

    private:
        SessionBrowserPanel& panel;
    };

    //==========================================================================
    juce::TextEditor searchBox;
    juce::TextButton btnAllFiles { "All Files" };
    juce::TextButton btnRecent { "Recent" };
    juce::ListBox listBox;
    EntryListBoxModel model;

    ViewMode viewMode { ViewMode::AllFiles };
    int hoveredRow { -1 };

    juce::Array<FileEntry> allEntries;
    juce::Array<FileEntry> filteredEntries;

    // Recently opened tracking
    static constexpr int maxRecentEntries = 20;
    juce::StringArray recentPaths;
    juce::Array<juce::Time> recentTimes;

#if JUCE_MAC || JUCE_WINDOWS
    FileSystemWatcher watcher;
#endif

    void scanDirectory();
    void applyFilter();
    void timerCallback() override;
    void openEntry (const FileEntry entry);
    void showContextMenu (int row, const juce::MouseEvent& e);

    // View mode
    void setViewMode (ViewMode mode);
    void updateSegmentButtons();
    void styleSegmentButton (juce::TextButton& btn, bool active);

    // Recent file persistence
    juce::File getRecentFilePath() const;
    void loadRecentFiles();
    void saveRecentFiles();
    void buildRecentEntries();

    // FileSystemWatcher::Listener
    void folderChanged (const juce::File&) override { refresh(); }
    void fileChanged (const juce::File&, FileSystemWatcher::FileSystemEvent) override { refresh(); }

    static FileCategory categoryFromExtension (const juce::String& ext);
    static juce::String categoryLabel (FileCategory cat);
    static juce::String formatFileSize (juce::int64 bytes);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SessionBrowserPanel)
};

} // namespace element
