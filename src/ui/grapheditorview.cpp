// Copyright 2019-2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include "ui/guicommon.hpp"
#include "ui/block.hpp"
#include "ui/grapheditorview.hpp"
#include "common.hpp"
#include "scopedcallback.hpp"
#include "engine/midiengine.hpp"

namespace element {

GraphEditorView::GraphEditorView()
{
    init();
}

GraphEditorView::GraphEditorView (const Node& g)
    : node (g)
{
    init();
}

void GraphEditorView::init()
{
    setName (EL_VIEW_GRAPH_EDITOR);
    addAndMakeVisible (_editor);
    addAndMakeVisible (_minimap);
    addChildComponent (_search); // Initially hidden
    setSize (640, 360);
    setWantsKeyboardFocus (true);

    // Setup minimap connections
    _minimap.setGraphEditor (&_editor.graphEditorComponent());
    _minimap.setViewport (&_editor.viewport());

    // Setup search component
    _search.setGraphEditor (&_editor.graphEditorComponent());

    // Connect toolbar to graph editor
    auto& toolbar = getToolbar();
    toolbar.setGraphEditor (&_editor.graphEditorComponent());

    // Breadcrumb click navigates up the graph hierarchy
    toolbar.onBreadcrumbClicked = [this] (const Node& clickedNode) {
        setNode (clickedNode);
    };

    // Keep zoom label in sync when zoom changes
    _editor.graphEditorComponent().onZoomChanged = [this]() {
        getToolbar().updateZoomLabel();
        getToolbar().repaint();
    };
}

GraphEditorView::~GraphEditorView()
{
    // Clear callbacks that capture raw `this` before members are destroyed
    _editor.graphEditorComponent().onZoomChanged = nullptr;
    getToolbar().onBreadcrumbClicked = nullptr;
    getToolbar().setGraphEditor (nullptr);

    nodeSelectedConnection.disconnect();
    nodeRemovedConnection.disconnect();
    sessionLoadedConnection.disconnect();
}

void GraphEditorView::willBeRemoved()
{
    auto* world = ViewHelpers::getGlobals (this);
    jassert (world); // something went majorly wrong...
    if (world)
        world->midi().removeChangeListener (this);
    saveSettings();
    _editor.setNode (Node());
}

bool GraphEditorView::keyPressed (const KeyPress& key)
{
    if (key.getKeyCode() == KeyPress::backspaceKey || key.getKeyCode() == KeyPress::deleteKey)
    {
        _editor.deleteSelectedNodes();
        _editor.deleteSelectedCommentBoxes();
        return true;
    }

    // Cmd+D duplicates selected nodes
    if ((key.getKeyCode() == 'd' || key.getKeyCode() == 'D') && key.getModifiers().isCommandDown())
    {
        _editor.graphEditorComponent().duplicateSelectedNodes();
        return true;
    }

    // Cmd+T or Cmd+R renames selected node(s)
    if (((key.getKeyCode() == 't' || key.getKeyCode() == 'T') ||
         (key.getKeyCode() == 'r' || key.getKeyCode() == 'R')) &&
        key.getModifiers().isCommandDown())
    {
        _editor.graphEditorComponent().renameSelectedNodes();
        return true;
    }

    // Ctrl+F (Cmd+F on Mac) opens node search
    if (key.getKeyCode() == 'f' || key.getKeyCode() == 'F')
    {
        if (key.getModifiers().isCommandDown())
        {
            showNodeSearch();
            return true;
        }
    }

    // Shift+C creates a comment box around selected nodes (like Unreal Engine)
    if ((key.getKeyCode() == 'c' || key.getKeyCode() == 'C') && key.getModifiers().isShiftDown())
    {
        _editor.createCommentBox();
        return true;
    }

    // Shift+M toggles minimap visibility
    if ((key.getKeyCode() == 'm' || key.getKeyCode() == 'M') && key.getModifiers().isShiftDown())
    {
        setMinimapVisible (! isMinimapVisible());
        return true;
    }

    return ContentView::keyPressed (key);
}

void GraphEditorView::parentHierarchyChanged()
{
    if (node.isValid())
    {
        setNode (node);
        node = Node();
        stabilizeContent();
    }
}

void GraphEditorView::stabilizeContent()
{
    if (! (nodeSelectedConnection.connected() && nodeRemovedConnection.connected()))
    {
        if (auto* const cc = ViewHelpers::findContentComponent (this))
        {
            if (auto* gui = cc->services().find<GuiService>())
            {
                nodeSelectedConnection = gui->nodeSelected.connect (
                    std::bind (&GraphEditorView::onNodeSelected, this));
                if (auto* eng = gui->sibling<EngineService>())
                    nodeRemovedConnection = eng->sigNodeRemoved.connect (
                        std::bind (&GraphEditorView::onNodeRemoved, this, std::placeholders::_1));
            }
            if (auto* s = cc->services().find<SessionService>())
                sessionLoadedConnection = s->sigSessionLoaded.connect (
                    std::bind (&GraphEditorView::onSessionLoaded, this));
        }
    }

    if (! getGraph().isValid() || ! getGraph().isGraph())
    {
        if (auto session = ViewHelpers::getSession (this))
            setNode (session->getCurrentGraph());
    }

    const auto g = getGraph();
    _editor.setNode (g);
    getToolbar().setGraphEditor (&_editor.graphEditorComponent());
    getToolbar().updateZoomLabel();
    onNodeSelected();
}

void GraphEditorView::didBecomeActive()
{
    auto* world = ViewHelpers::getGlobals (this);
    jassert (world); // something went majorly wrong...
    if (world)
        world->midi().addChangeListener (this);
    stabilizeContent();
    restoreSettings();
    _editor.updateComponents();
}

void GraphEditorView::changeListenerCallback (ChangeBroadcaster*)
{
    _editor.stabilizeNodes();
}

void GraphEditorView::paint (Graphics& g)
{
    g.fillAll (Colors::contentBackgroundColor);
}

void GraphEditorView::graphDisplayResized (const Rectangle<int>& area)
{
    auto r = area;
    _editor.setBounds (r);

    // Auto-hide minimap in small windows (< 600px wide)
    if (r.getWidth() < 600)
        _minimap.setVisible (false);
    else
        _minimap.setVisible (minimapVisible);

    updateMinimapBounds();
    updateSearchBounds();

    auto s = settings();
    if (s.isValid())
    {
        s.setProperty (tags::width, _editor.getWidth(), nullptr)
            .setProperty (tags::height, _editor.getHeight(), nullptr);
    }
}

void GraphEditorView::graphNodeWillChange()
{
    saveSettings();
}

void GraphEditorView::graphNodeChanged (const Node& g, const Node&)
{
    stabilizeContent();
    restoreSettings();
    updateSizeInternal (false);
}

void GraphEditorView::onSessionLoaded()
{
}

void GraphEditorView::onNodeSelected()
{
    if (auto* const cc = ViewHelpers::findContentComponent (this))
    {
        auto session = cc->session();
        auto* gui = cc->services().find<GuiService>();
        if (gui == nullptr) return;
        const auto selected = gui->getSelectedNode();
        if (selected.descendsFrom (getGraph()))
        {
            // prevent minor gui changes from marking session as dirty.
            // This is a hack and need a better solution;
            Session::ScopedFrozenLock freeze (*session);
            _editor.selectNode (selected);
        }
    }
}

void GraphEditorView::onNodeRemoved (const Node& rnode)
{
    if (rnode.isGraph() && rnode == getGraph())
    {
        auto nextGraph = Node();
        if (auto session = ViewHelpers::getSession (this))
            nextGraph = session->getActiveGraph();
        setNode (nextGraph);
    }
}

void GraphEditorView::updateSizeInternal (const bool force)
{
#if 0
    auto r = _editor.getRequiredSpace();
    const auto rc = r;
    if (r.getWidth() <= view.getWidth())
        r.setWidth (view.getWidth());
    if (r.getHeight() <= view.getHeight())
        r.setHeight (view.getHeight());
    if (force || r != rc)
        _editor.setBounds (r);
#endif
}

ValueTree GraphEditorView::settings() const
{
    ValueTree uivt = getGraph().getUIValueTree();
    return uivt.isValid() ? uivt.getOrCreateChildWithName ("GraphEditorView", nullptr)
                          : ValueTree();
}

void GraphEditorView::restoreSettings()
{
    auto s = settings();
    if (! s.isValid())
    {
        updateSizeInternal();
        return;
    }

#if 0
    _editor.setSize (s.getProperty (tags::width, getWidth()),
                     s.getProperty (tags::height, getHeight()));
   
    _editor.setZoomScale (s.getProperty ("zoomScale", 1.0f));
#endif

    resized();
}

void GraphEditorView::saveSettings()
{
    auto s = settings();
    if (! s.isValid())
        return;

    s.setProperty (tags::width, _editor.getWidth(), nullptr);
    s.setProperty (tags::height, _editor.getHeight(), nullptr);
    // s.setProperty ("horizontalRangeStart", view.getHorizontalScrollBar().getCurrentRangeStart(), nullptr);
    // s.setProperty ("verticalRangeStart", view.getVerticalScrollBar().getCurrentRangeStart(), nullptr);
    // s.setProperty ("zoomScale", _editor.getZoomScale(), nullptr);
}

void GraphEditorView::selectAllNodes() { _editor.selectAllNodes(); }

void GraphEditorView::setMinimapVisible (bool visible)
{
    minimapVisible = visible;
    _minimap.setVisible (visible);
    updateMinimapBounds();
}

void GraphEditorView::updateMinimapBounds()
{
    if (! minimapVisible)
        return;

    // Position minimap in bottom-right corner
    const int minimapWidth = 150;
    const int minimapHeight = 100;
    const int margin = 10;

    auto editorBounds = _editor.getBounds();
    _minimap.setBounds (
        editorBounds.getRight() - minimapWidth - margin,
        editorBounds.getBottom() - minimapHeight - margin,
        minimapWidth,
        minimapHeight
    );

    _minimap.toFront (false);
}

void GraphEditorView::showNodeSearch()
{
    updateSearchBounds();
    _search.show();
    _search.toFront (true);
}

void GraphEditorView::hideNodeSearch()
{
    _search.hide();
}

void GraphEditorView::updateSearchBounds()
{
    // Position search popup in top-center of the editor, clamped to viewport
    const int searchWidth = juce::jmin (300, _editor.getWidth() - 20);
    const int searchHeight = juce::jmin (200, _editor.getHeight() - 60);
    const int topMargin = 40;

    auto editorBounds = _editor.getBounds();
    int searchX = editorBounds.getX() + (editorBounds.getWidth() - searchWidth) / 2;
    int searchY = editorBounds.getY() + topMargin;

    // Clamp to stay within editor bounds
    searchX = juce::jmax (editorBounds.getX(), juce::jmin (searchX, editorBounds.getRight() - searchWidth));
    searchY = juce::jmax (editorBounds.getY(), juce::jmin (searchY, editorBounds.getBottom() - searchHeight));

    _search.setBounds (
        searchX,
        searchY,
        searchWidth,
        searchHeight
    );
}

} /* namespace element */
