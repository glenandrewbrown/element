// Copyright 2026 Kushview, LLC
// SPDX License Identifier: GPL-3.0-or-later

#include <element/session.hpp>
#include <element/ui/web_content.hpp>

#if JUCE_WEB_BROWSER

 #include <element/ui/content.hpp>

namespace element {

namespace {
Node findRootGraphNode (const Node& node)
{
    auto root = node;
    while (! root.isRootGraph())
        root = root.getParentGraph();
    return root;
}

Node graphNodeContaining (const Node& node)
{
    if (node.isGraph() || ! node.isValid())
        return node;
    auto g = node.getParentGraph();
    if (g.isValid())
        return g;
    return findRootGraphNode (node);
}
} // namespace

WebContent::WebContent (Context& ctx) : Content (ctx)
{
    webHost = std::make_unique<ElementWebViewHost> (ctx);
    webHost->setWebShell (this);
    addAndMakeVisible (*webHost);

    if (auto eng = context().audio())
        eng->setWebPeakMeterFifo (&webHost->getMeteringFifo());

    webHost->pushGraphSnapshot();
    resized();
}

WebContent::~WebContent()
{
    dismissPresentedView();
    if (auto eng = context().audio())
        eng->setWebPeakMeterFifo (nullptr);
}

void WebContent::dismissPresentedView()
{
    if (presentedView != nullptr)
    {
        presentedView->willBeRemoved();
        removeChildComponent (presentedView.get());
        presentedView.reset();
    }
}

void WebContent::presentContentOverlay (std::unique_ptr<ContentView> view)
{
    dismissPresentedView();
    if (view == nullptr)
        return;
    view->initializeView (context().services());
    presentedView = std::move (view);
    addAndMakeVisible (*presentedView);
    presentedView->toFront (true);
    resized();
}

void WebContent::resizeContent (const juce::Rectangle<int>& area)
{
    auto r = area;
    if (footerOwned != nullptr && footerHeight > 0)
    {
        footerOwned->setVisible (true);
        footerOwned->setBounds (r.removeFromBottom (footerHeight));
    }
    webHost->setBounds (r);
    if (presentedView != nullptr)
        presentedView->setBounds (r.reduced (24));
}

void WebContent::presentView (std::unique_ptr<View> view)
{
    if (view == nullptr)
        return;
    if (auto* cv = dynamic_cast<ContentView*> (view.get()))
    {
        view.release();
        presentContentOverlay (std::unique_ptr<ContentView> (cv));
    }
}

void WebContent::presentView (const juce::String&) {}

void WebContent::stabilizeViews()
{
    if (webHost != nullptr)
        webHost->pushGraphSnapshot();
}

void WebContent::setExtraView (juce::Component* extra)
{
    footerOwned.reset (extra);
    footerHeight = extra != nullptr ? extra->getHeight() : 0;
    if (footerOwned != nullptr)
    {
        if (footerHeight <= 0)
            footerHeight = 96;
        footerOwned->setSize (getWidth(), footerHeight);
        addAndMakeVisible (*footerOwned);
    }
    resized();
}

juce::Component* WebContent::extraView()
{
    return footerOwned.get();
}

void WebContent::setupPluginEditorWithGraph (Graph&)
{
    stabilizeViews();
}

void WebContent::activateBoard (const Node& graphNode)
{
    auto g = graphNode;
    if (! g.isGraph())
        g = graphNodeContaining (graphNode);

    if (! g.isGraph())
        return;

    auto sess = session();
    if (sess == nullptr)
        return;

    for (int i = 0; i < sess->getNumGraphs(); ++i)
    {
        const Node gn (sess->getGraph (i));
        if (gn.isGraph() && gn.getUuidString() == g.getUuidString())
        {
            sess->setActiveGraph (i);
            stabilizeViews();
            return;
        }
    }
}

} // namespace element

#endif // JUCE_WEB_BROWSER
