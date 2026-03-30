// Copyright 2019-2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/ui/commands.hpp>
#include <element/ui/content.hpp>

#include "ui/guicommon.hpp"
#include "ui/graphtoolbar.hpp"

namespace element {

/** This is a simple container which displays a toolbar (with breadcrumb and
    zoom controls) above a content area. */
class GraphDisplayView : public ContentView
{
public:
    GraphDisplayView()
    {
        addAndMakeVisible (toolbar);
    }

    virtual ~GraphDisplayView() = default;

    inline void setBreadCrumbVisible (const bool isVisible)
    {
        if (isVisible != toolbar.isVisible())
        {
            toolbar.setVisible (isVisible);
            resized();
        }
    }

    inline void setNode (const Node& n)
    {
        Node newGraph = n.isGraph() ? n : n.getParentGraph();
        Node newNode = n.isGraph() ? Node() : n;

        if (newGraph != graph || newNode != node)
        {
            graphNodeWillChange();

            graph = newGraph;
            node = newNode;

            if (node.isValid())
                toolbar.setBreadcrumbNode (node);
            else if (graph.isValid())
                toolbar.setBreadcrumbNode (graph);
            else
                toolbar.setBreadcrumbNode (Node());

            graphNodeChanged (graph, node);
        }
    }

    inline void resized() override
    {
        auto r = getLocalBounds();
        if (toolbar.isVisible())
            toolbar.setBounds (r.removeFromTop (28));
        graphDisplayResized (r);
    }

    Node getGraph() const { return graph; }
    Node getNode() const { return node; }

    GraphEditorToolbar& getToolbar() { return toolbar; }

protected:
    virtual void graphDisplayResized (const Rectangle<int>& area) = 0;
    virtual void graphNodeWillChange() {}
    virtual void graphNodeChanged (const Node&, const Node&) {}

private:
    Node graph, node;
    GraphEditorToolbar toolbar;
};

} // namespace element
