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

/** A panel that shows saved sessions, graphs, and presets sorted by date
    modified, with search filtering.  Lives in the navigation concertina. */
class SessionBrowserPanel : public juce::Component,
                            public juce::Timer,
                            public FileSystemWatcher::Listener
{
public:
    SessionBrowserPanel();
    ~SessionBrowserPanel() override;

    void resized() override;
    void paint (juce::Graphics&) override;

    /** Refresh the file list from disk. */
    void refresh();

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
    juce::ComboBox categoryFilter;
    juce::ListBox listBox;
    EntryListBoxModel model;

    juce::Array<FileEntry> allEntries;
    juce::Array<FileEntry> filteredEntries;

#if JUCE_MAC || JUCE_WINDOWS
    FileSystemWatcher watcher;
#endif

    void scanDirectory();
    void applyFilter();
    void timerCallback() override;
    void openEntry (const FileEntry& entry);
    void showContextMenu (int row, const juce::MouseEvent& e);

    // FileSystemWatcher::Listener
    void folderChanged (const juce::File&) override { refresh(); }
    void fileChanged (const juce::File&, FileSystemWatcher::FileSystemEvent) override { refresh(); }

    static FileCategory categoryFromExtension (const juce::String& ext);
    static juce::String categoryLabel (FileCategory cat);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SessionBrowserPanel)
};

} // namespace element
