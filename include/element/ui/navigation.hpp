// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/gui_basics.hpp>

namespace element {

class BrowsePanel;
class Context;
class GraphSettingsView;
class InspectorPanel;
class Node;
class NodeEditorView;
class NodePropertiesView;
class PluginsPanelView;
class SessionBrowserPanel;
class SessionTreePanel;

/** Icon-sidebar navigation replacing the old ConcertinaPanel.
    4 panels: Session (0), Browse (1), Inspector (2), Editor (3).
    A 24px icon strip on the left switches between panels. */
class NavigationPanel : public juce::Component
{
public:
    NavigationPanel (Context& g);
    ~NavigationPanel();

    void saveState (juce::PropertiesFile* props);
    void restoreState (juce::PropertiesFile* props);

    // Typed accessors
    SessionTreePanel* getSessionTreePanel();
    NodePropertiesView* getNodePropertiesView();
    NodeEditorView* getNodeEditorView();
    GraphSettingsView* getGraphSettingsView();
    PluginsPanelView* getPluginsPanel();
    SessionBrowserPanel* getSessionsPanel();

    void activatePanel (int index);
    int getActivePanel() const;

    void stabilizeAll();
    void notifyNodeSelected (const Node& node);
    void notifyNodeDeselected();

    void resized() override;
    void paint (juce::Graphics&) override;

private:
    Context& globals;

    // Icon strip
    struct IconButton;
    juce::OwnedArray<IconButton> icons;
    int activeIndex = 1; // default to Browse

    // Panels
    std::unique_ptr<SessionTreePanel> sessionPanel;
    std::unique_ptr<BrowsePanel> browsePanel;
    std::unique_ptr<InspectorPanel> inspectorPanel;
    std::unique_ptr<NodeEditorView> editorPanel;

    void showPanel (int index);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NavigationPanel)
};

// Backward compatibility alias
using NavigationConcertinaPanel = NavigationPanel;

} // namespace element
