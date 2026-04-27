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
                         public juce::ChangeListener,
                         public juce::TextEditor::Listener,
                         public juce::Timer
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
    void paint (juce::Graphics&) override;

    /** Returns the text in the search box */
    juce::String getSearchText() { return search.getText(); }

    /** @internal */
    void textEditorTextChanged (juce::TextEditor&) override;
    void textEditorReturnKeyPressed (juce::TextEditor&) override;
    void changeListenerCallback (juce::ChangeBroadcaster*) override;
    void timerCallback() override;
    void mouseMove (const juce::MouseEvent& e) override;
    void mouseExit (const juce::MouseEvent& e) override;

    void setViewMode (ViewMode mode);
    void refreshContent();

private:
    class FlatListModel;

    PluginManager& plugins;
    juce::TreeView tree;
    juce::TextEditor search;
    juce::ListBox flatList;
    std::unique_ptr<FlatListModel> flatListModel;

    juce::TextButton btnAll { "All" };
    juce::TextButton btnFavorites { "Favorites" };
    juce::TextButton btnRecent { "Recent" };

    ViewMode viewMode { ViewMode::All };
    int hoveredRow { -1 };
    bool isRefreshing { false };

    void updateTreeView();
    void styleSegmentButton (juce::TextButton& btn, bool active);
    void updateSegmentButtons();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginsPanelView);
};

} // namespace element

#endif // EL_PLUGINS_PANEL_VIEW_H
