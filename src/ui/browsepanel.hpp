// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/gui_basics.hpp>

#include "ui/pluginspanelview.hpp"
#include "ui/sessionbrowserpanel.hpp"

namespace element {

class PluginManager;

/** Tabbed wrapper combining PluginsPanelView and SessionBrowserPanel.
    Lives inside NavigationPanel as the "Browse" panel (index 1). */
class BrowsePanel : public juce::Component
{
public:
    BrowsePanel (PluginManager& pm)
    {
        btnPlugins.setClickingTogglesState (false);
        btnSessions.setClickingTogglesState (false);

        btnPlugins.onClick = [this] { showTab (0); };
        btnSessions.onClick = [this] { showTab (1); };

        addAndMakeVisible (btnPlugins);
        addAndMakeVisible (btnSessions);

        pluginsPanel = std::make_unique<PluginsPanelView> (pm);
        sessionsPanel = std::make_unique<SessionBrowserPanel>();

        addChildComponent (*pluginsPanel);
        addChildComponent (*sessionsPanel);

        showTab (0);
    }

    void resized() override
    {
        auto r = getLocalBounds();
        auto tabArea = r.removeFromTop (20);
        int tabW = tabArea.getWidth() / 2;
        btnPlugins.setBounds (tabArea.removeFromLeft (tabW));
        btnSessions.setBounds (tabArea);
        pluginsPanel->setBounds (r);
        sessionsPanel->setBounds (r);
    }

    PluginsPanelView* getPluginsPanel() { return pluginsPanel.get(); }
    SessionBrowserPanel* getSessionsPanel() { return sessionsPanel.get(); }
    int getActiveTab() const { return activeTab; }

    void showTab (int index)
    {
        activeTab = juce::jlimit (0, 1, index);

        pluginsPanel->setVisible (activeTab == 0);
        sessionsPanel->setVisible (activeTab == 1);

        updateButtonStyles();
        repaint();
    }

private:
    juce::TextButton btnPlugins { "Plugins" };
    juce::TextButton btnSessions { "Projects" };
    std::unique_ptr<PluginsPanelView> pluginsPanel;
    std::unique_ptr<SessionBrowserPanel> sessionsPanel;
    int activeTab = 0;

    void updateButtonStyles()
    {
        const auto activeColour = juce::Colour (0xff4765a0);
        const auto activeText = juce::Colours::white;
        const auto inactiveColour = juce::Colour (0x00000000);
        const auto inactiveText = juce::Colour (0xff888888);

        btnPlugins.setColour (juce::TextButton::buttonColourId,
                              activeTab == 0 ? activeColour : inactiveColour);
        btnPlugins.setColour (juce::TextButton::textColourOffId,
                              activeTab == 0 ? activeText : inactiveText);

        btnSessions.setColour (juce::TextButton::buttonColourId,
                               activeTab == 1 ? activeColour : inactiveColour);
        btnSessions.setColour (juce::TextButton::textColourOffId,
                               activeTab == 1 ? activeText : inactiveText);
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BrowsePanel)
};

} // namespace element
