// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/gui_basics.hpp>

#include "ui/nodepropertiesview.hpp"
#include "ui/graphsettingsview.hpp"

namespace element {

/** Tabbed wrapper combining NodePropertiesView and GraphSettingsView.
    Lives inside NavigationPanel as the "Inspector" panel (index 2).
    Auto-switches to Node tab on selection unless the user manually navigated. */
class InspectorPanel : public juce::Component
{
public:
    InspectorPanel()
    {
        btnNode.setClickingTogglesState (false);
        btnGraph.setClickingTogglesState (false);

        btnNode.onClick = [this] {
            userNavigatedAway = (activeTab == 0);
            showTab (0);
            userNavigatedAway = false;
        };
        btnGraph.onClick = [this] {
            userNavigatedAway = true;
            showTab (1);
        };

        addAndMakeVisible (btnNode);
        addAndMakeVisible (btnGraph);

        nodeProps = std::make_unique<NodePropertiesView>();
        graphSettings = std::make_unique<GraphSettingsView>();
        graphSettings->setGraphButtonVisible (false);
        graphSettings->setUpdateOnActiveGraphChange (true);
        graphSettings->setPropertyPanelHeaderVisible (false);

        addChildComponent (*nodeProps);
        addChildComponent (*graphSettings);

        showTab (0);
    }

    void resized() override
    {
        auto r = getLocalBounds();
        auto tabArea = r.removeFromTop (20);
        int tabW = tabArea.getWidth() / 2;
        btnNode.setBounds (tabArea.removeFromLeft (tabW));
        btnGraph.setBounds (tabArea);
        nodeProps->setBounds (r);
        graphSettings->setBounds (r);
    }

    NodePropertiesView* getNodePropertiesView() { return nodeProps.get(); }
    GraphSettingsView* getGraphSettingsView() { return graphSettings.get(); }
    int getActiveTab() const { return activeTab; }

    /** Called when a node is selected in the graph editor. */
    void notifyNodeSelected()
    {
        if (! userNavigatedAway)
            showTab (0);
    }

    /** Called when a node is deselected. */
    void notifyNodeDeselected()
    {
        if (! userNavigatedAway)
            showTab (1);
    }

    void showTab (int index)
    {
        activeTab = juce::jlimit (0, 1, index);

        nodeProps->setVisible (activeTab == 0);
        graphSettings->setVisible (activeTab == 1);

        updateButtonStyles();
        repaint();
    }

private:
    std::unique_ptr<NodePropertiesView> nodeProps;
    std::unique_ptr<GraphSettingsView> graphSettings;
    juce::TextButton btnNode { "Node" };
    juce::TextButton btnGraph { "Graph" };
    int activeTab = 0;
    bool userNavigatedAway = false;

    void updateButtonStyles()
    {
        const auto activeColour = juce::Colour (0xff4765a0);
        const auto activeText = juce::Colours::white;
        const auto inactiveColour = juce::Colour (0x00000000);
        const auto inactiveText = juce::Colour (0xff888888);

        btnNode.setColour (juce::TextButton::buttonColourId,
                           activeTab == 0 ? activeColour : inactiveColour);
        btnNode.setColour (juce::TextButton::textColourOffId,
                           activeTab == 0 ? activeText : inactiveText);

        btnGraph.setColour (juce::TextButton::buttonColourId,
                            activeTab == 1 ? activeColour : inactiveColour);
        btnGraph.setColour (juce::TextButton::textColourOffId,
                            activeTab == 1 ? activeText : inactiveText);
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InspectorPanel)
};

} // namespace element
