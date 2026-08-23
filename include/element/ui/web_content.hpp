// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/graph.hpp>
#include <element/ui/content.hpp>

#if JUCE_WEB_BROWSER
 #include <element/ui/element_webview_host.hpp>
#endif

#include <memory>

namespace element {

#if JUCE_WEB_BROWSER

class WebContent : public Content {
public:
    explicit WebContent (Context&);
    ~WebContent() override;

    void resizeContent (const juce::Rectangle<int>& area) override;
    void presentView (std::unique_ptr<View>) override;
    void presentView (const juce::String&) override;
    void stabilizeViews() override;

    void setExtraView (juce::Component*) override;
    juce::Component* extraView() override;

    void setupPluginEditorWithGraph (Graph&) override;

    /** Session browser: make this board active and refresh the Web UI. */
    void activateBoard (const Node& graphNode);

    ElementWebViewHost& getWebHost() noexcept { return *webHost; }

    /** Close native overlay (Lua console, graph mixer, etc.) opened from the Web bridge. */
    void dismissPresentedView();

    /** Show a classic ContentView on top of the WebView (bridge-driven). */
    void presentContentOverlay (std::unique_ptr<ContentView> view);

private:
    std::unique_ptr<ElementWebViewHost> webHost;
    std::unique_ptr<ContentView> presentedView;
    std::unique_ptr<juce::Component> footerOwned;
    int footerHeight = 0;
};

#endif // JUCE_WEB_BROWSER

} // namespace element
