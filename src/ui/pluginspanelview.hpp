// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#ifndef EL_PLUGINS_PANEL_VIEW_H
#define EL_PLUGINS_PANEL_VIEW_H

#include <element/ui/content.hpp>
#include <juce_audio_processors/juce_audio_processors.h>

namespace element {

class PluginManager;
class PluginUsageTracker;

class PluginsPanelView : public ContentView,
                         public ChangeListener,
                         public TextEditor::Listener,
                         public Timer
{
public:
    enum class ViewMode
    {
        All,
        Favorites,
        Recent
    };

    PluginsPanelView (PluginManager& pm);
    ~PluginsPanelView();

    void resized() override;
    void paint (Graphics&) override;

    /** Returns the text in the search box */
    String getSearchText() { return search.getText(); }

    /** @internal */
    void textEditorTextChanged (TextEditor&) override;
    void textEditorReturnKeyPressed (TextEditor&) override;
    void changeListenerCallback (ChangeBroadcaster*) override;
    void timerCallback() override;
    void mouseMove (const MouseEvent& e) override;
    void mouseExit (const MouseEvent& e) override;

    void setViewMode (ViewMode mode);
    void refreshContent();

private:
    class FlatListModel;

    PluginManager& plugins;
    TreeView tree;
    TextEditor search;
    ListBox flatList;
    std::unique_ptr<FlatListModel> flatListModel;

    TextButton btnAll { "All" };
    TextButton btnFavorites { "Favorites" };
    TextButton btnRecent { "Recent" };

    ViewMode viewMode { ViewMode::All };
    int hoveredRow { -1 };
    bool isRefreshing { false };

    void updateTreeView();
    void styleSegmentButton (TextButton& btn, bool active);
    void updateSegmentButtons();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginsPanelView);
};

} // namespace element

#endif // EL_PLUGINS_PANEL_VIEW_H
