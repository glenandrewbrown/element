// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/node.hpp>
#include <element/ui/style.hpp>
#include <element/ui/commands.hpp>
#include <element/ui/navigation.hpp>

#include "ui/browsepanel.hpp"
#include "ui/inspectorpanel.hpp"
#include "ui/nodeeditorview.hpp"
#include "ui/graphsettingsview.hpp"
#include "ui/nodepropertiesview.hpp"
#include "ui/pluginspanelview.hpp"
#include "ui/sessiontreepanel.hpp"
#include "ui/sessionbrowserpanel.hpp"
#include "ui/viewhelpers.hpp"

namespace element {

namespace {

constexpr int iconStripWidth = 24;
constexpr int iconCellSize = 24;
constexpr int iconDrawSize = 14;
constexpr int numPanels = 4;

const juce::Colour iconDefault (0xff6b7280);
const juce::Colour iconHover (0xffcccccc);
const juce::Colour iconActive (0xff33aaf9);
const juce::Colour hoverBg (0xff2e3235);
const juce::Colour stripBg (0xff16191a);

juce::Path createTreeIcon()
{
    juce::Path p;
    // 3 horizontal lines with left indent hierarchy (tree structure)
    p.addRectangle (0.0f, 1.0f, 10.0f, 1.5f);
    p.addRectangle (3.0f, 5.5f, 8.0f, 1.5f);
    p.addRectangle (3.0f, 10.0f, 8.0f, 1.5f);
    // vertical connector
    p.addRectangle (1.0f, 1.0f, 1.0f, 10.5f);
    return p;
}

juce::Path createSearchIcon()
{
    juce::Path p;
    // magnifying glass: circle + diagonal line
    p.addEllipse (0.0f, 0.0f, 8.0f, 8.0f);
    p.addRectangle (0.5f, 0.5f, 7.0f, 7.0f); // clear interior
    // Re-do as stroked circle
    p.clear();
    juce::Path circle;
    circle.addEllipse (0.0f, 0.0f, 8.5f, 8.5f);
    juce::PathStrokeType stroke (1.5f);
    stroke.createStrokedPath (p, circle);
    // handle
    p.addRectangle (7.5f, 7.5f, 5.0f, 1.8f);
    p.applyTransform (juce::AffineTransform::rotation (juce::MathConstants<float>::pi * 0.25f, 4.25f, 4.25f));
    return p;
}

juce::Path createSlidersIcon()
{
    juce::Path p;
    // 3 horizontal lines with dots (mixer/sliders icon)
    p.addRectangle (0.0f, 1.0f, 12.0f, 1.2f);
    p.addRectangle (0.0f, 5.5f, 12.0f, 1.2f);
    p.addRectangle (0.0f, 10.0f, 12.0f, 1.2f);
    // dots on each line at different positions
    p.addEllipse (3.0f, 0.0f, 3.0f, 3.0f);
    p.addEllipse (7.0f, 4.5f, 3.0f, 3.0f);
    p.addEllipse (5.0f, 9.0f, 3.0f, 3.0f);
    return p;
}

juce::Path createPencilIcon()
{
    juce::Path p;
    // pencil: diagonal line with pointed tip
    p.startNewSubPath (9.0f, 0.5f);
    p.lineTo (12.0f, 3.5f);
    p.lineTo (4.0f, 11.5f);
    p.lineTo (0.5f, 12.5f);
    p.lineTo (1.5f, 9.0f);
    p.closeSubPath();
    // inner detail line
    p.startNewSubPath (8.0f, 2.0f);
    p.lineTo (10.5f, 4.5f);
    return p;
}

} // namespace

// =============================================================================
struct NavigationPanel::IconButton : public juce::Component,
                                     public juce::TooltipClient
{
    int index = 0;
    juce::Path iconPath;
    bool isActive = false;
    bool isHovered = false;
    std::function<void (int)> onClick;
    juce::String tooltip;

    IconButton (int idx, juce::Path path, const juce::String& tip = {})
        : index (idx), iconPath (std::move (path)), tooltip (tip)
    {
    }

    juce::String getTooltip() override { return tooltip; }

    void paint (juce::Graphics& g) override
    {
        if (isActive)
        {
            g.setColour (iconActive);
            g.fillRect (0, 0, 2, getHeight());
        }

        if (isHovered && ! isActive)
            g.fillAll (hoverBg);

        g.setColour (isActive ? iconActive
                     : isHovered ? iconHover
                                 : iconDefault);

        auto iconArea = getLocalBounds().toFloat().reduced (5.0f);
        g.fillPath (iconPath, iconPath.getTransformToScaleToFit (iconArea, true));
    }

    void mouseEnter (const juce::MouseEvent&) override
    {
        isHovered = true;
        repaint();
    }

    void mouseExit (const juce::MouseEvent&) override
    {
        isHovered = false;
        repaint();
    }

    void mouseDown (const juce::MouseEvent&) override
    {
        if (onClick)
            onClick (index);
    }
};

// =============================================================================
NavigationPanel::NavigationPanel (Context& g)
    : globals (g)
{
    // Create 4 icon buttons
    auto addIcon = [this] (int idx, juce::Path path, const juce::String& tip) {
        auto* btn = new IconButton (idx, std::move (path), tip);
        btn->onClick = [this] (int i) { showPanel (i); };
        addAndMakeVisible (btn);
        icons.add (btn);
    };

    addIcon (0, createTreeIcon(), "Session Tree");
    addIcon (1, createSearchIcon(), "Browse Plugins & Sessions");
    addIcon (2, createSlidersIcon(), "Inspector");
    addIcon (3, createPencilIcon(), "Node Editor");

    // Create panels
    sessionPanel = std::make_unique<SessionTreePanel>();
    browsePanel = std::make_unique<BrowsePanel> (g.plugins());
    inspectorPanel = std::make_unique<InspectorPanel>();
    editorPanel = std::make_unique<NodeEditorView>();

    addChildComponent (*sessionPanel);
    addChildComponent (*browsePanel);
    addChildComponent (*inspectorPanel);
    addChildComponent (*editorPanel);

    showPanel (activeIndex);
}

NavigationPanel::~NavigationPanel()
{
    // Clear icon callbacks first to prevent use-after-free during destruction
    for (auto* icon : icons)
        icon->onClick = nullptr;

    editorPanel.reset();
    inspectorPanel.reset();
    browsePanel.reset();
    sessionPanel.reset();
    icons.clear();
}

// =============================================================================
void NavigationPanel::showPanel (int index)
{
    activeIndex = juce::jlimit (0, numPanels - 1, index);

    if (sessionPanel)   sessionPanel->setVisible (activeIndex == 0);
    if (browsePanel)    browsePanel->setVisible (activeIndex == 1);
    if (inspectorPanel) inspectorPanel->setVisible (activeIndex == 2);
    if (editorPanel)    editorPanel->setVisible (activeIndex == 3);

    for (auto* icon : icons)
    {
        icon->isActive = (icon->index == activeIndex);
        icon->repaint();
    }

    resized();
}

void NavigationPanel::activatePanel (int index)
{
    showPanel (index);
}

int NavigationPanel::getActivePanel() const
{
    return activeIndex;
}

// =============================================================================
void NavigationPanel::paint (juce::Graphics& g)
{
    // Icon strip background
    g.setColour (stripBg);
    g.fillRect (0, 0, iconStripWidth, getHeight());

    // Content area background
    g.setColour (element::Colors::backgroundColor);
    g.fillRect (iconStripWidth, 0, getWidth() - iconStripWidth, getHeight());
}

void NavigationPanel::resized()
{
    // Icon strip
    for (int i = 0; i < icons.size(); ++i)
    {
        icons[i]->setBounds (0, i * iconCellSize, iconStripWidth, iconCellSize);
    }

    // Content area
    auto contentArea = getLocalBounds().withTrimmedLeft (iconStripWidth);

    if (sessionPanel)   sessionPanel->setBounds (contentArea);
    if (browsePanel)    browsePanel->setBounds (contentArea);
    if (inspectorPanel) inspectorPanel->setBounds (contentArea);
    if (editorPanel)    editorPanel->setBounds (contentArea);
}

// =============================================================================
SessionTreePanel* NavigationPanel::getSessionTreePanel()
{
    return sessionPanel.get();
}

NodePropertiesView* NavigationPanel::getNodePropertiesView()
{
    if (inspectorPanel)
        return inspectorPanel->getNodePropertiesView();
    return nullptr;
}

NodeEditorView* NavigationPanel::getNodeEditorView()
{
    return editorPanel.get();
}

GraphSettingsView* NavigationPanel::getGraphSettingsView()
{
    if (inspectorPanel)
        return inspectorPanel->getGraphSettingsView();
    return nullptr;
}

PluginsPanelView* NavigationPanel::getPluginsPanel()
{
    if (browsePanel)
        return browsePanel->getPluginsPanel();
    return nullptr;
}

SessionBrowserPanel* NavigationPanel::getSessionsPanel()
{
    if (browsePanel)
        return browsePanel->getSessionsPanel();
    return nullptr;
}

// =============================================================================
void NavigationPanel::stabilizeAll()
{
    if (auto* ss = getSessionTreePanel())
    {
        auto session = globals.session();
        ss->setSession (session);
    }

    if (auto* npv = getNodePropertiesView())
        npv->stabilizeContent();

    if (auto* nev = getNodeEditorView())
        nev->stabilizeContent();

    if (auto* gsv = getGraphSettingsView())
        gsv->stabilizeContent();
}

void NavigationPanel::notifyNodeSelected (const Node&)
{
    if (inspectorPanel)
        inspectorPanel->notifyNodeSelected();
}

void NavigationPanel::notifyNodeDeselected()
{
    if (inspectorPanel)
        inspectorPanel->notifyNodeDeselected();
}

// =============================================================================
void NavigationPanel::saveState (juce::PropertiesFile* props)
{
    if (props == nullptr)
        return;

    props->setValue ("navIconPanel_activeIndex", activeIndex);

    if (browsePanel)
        props->setValue ("navIconPanel_browseTab", browsePanel->getActiveTab());

    if (inspectorPanel)
        props->setValue ("navIconPanel_inspectorTab", inspectorPanel->getActiveTab());

    // Save NodeEditorView sticky state
    if (auto* ned = getNodeEditorView())
        props->setValue ("navIconPanel_editorSticky", ned->isSticky());
}

void NavigationPanel::restoreState (juce::PropertiesFile* props)
{
    if (props == nullptr)
        return;

    // Migrate from old ConcertinaPanel format
    if (props->containsKey ("ccNavPanel"))
    {
        props->removeValue ("ccNavPanel");
        activeIndex = 1; // default to Browse after migration
        props->setValue ("navIconPanel_activeIndex", activeIndex);
    }

    activeIndex = props->getIntValue ("navIconPanel_activeIndex", 1);
    showPanel (activeIndex);

    if (browsePanel)
    {
        int browseTab = props->getIntValue ("navIconPanel_browseTab", 0);
        browsePanel->showTab (browseTab);
    }

    if (inspectorPanel)
    {
        int inspTab = props->getIntValue ("navIconPanel_inspectorTab", 0);
        inspectorPanel->showTab (inspTab);
    }

    if (auto* ned = getNodeEditorView())
        ned->setSticky (props->getBoolValue ("navIconPanel_editorSticky", ned->isSticky()));
}

} // namespace element
