// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include "ElementApp.h"
#include <element/node.hpp>
#include <memory>

namespace element {

class Content;
class GuiService;
class Processor;

/** Same editor chrome as PluginWindow, for embedding in WebContent / WebView host (no DocumentWindow).

    When @p docked is true the panel is built for the WebView dock overlay: the internal
    floating-window toolbar (n/power/onTop/mute) is suppressed (the webview draws its own
    drag handle), the panel's reported size is exactly the real plugin editor's size (no
    toolbar band), and resized() fits the editor flush to the panel from the top-left so the
    host can adopt the editor's REAL native size (e.g. Kontakt ~1140x700) without squishing.

    This helper is the EMBED-only path (its single caller is ElementWebViewHost::pluginEditorOpen);
    the floating DocumentWindow path constructs PluginWindowContent directly with its own chrome,
    so @p docked defaults to true here. */
std::unique_ptr<juce::Component> createPluginEditorPanel (GuiService&, const Node& node, bool docked = true);

/** A desktop window containing a plugin's UI. */
class PluginWindow : public DocumentWindow,
                     private Value::Listener
{
public:
    struct Settings
    {
        Colour backgroundColor;
        int titleBarHeight;
    };

    ~PluginWindow();

    float getDesktopScaleFactor() const override;

    Content* getElementContentComponent() const;

    Toolbar* getToolbar() const;
    void updateGraphNode (Processor* newNode, Component* newEditor);
    Node getNode() const { return node; }
    void restoreAlwaysOnTopState();

    void moved() override;
    void closeButtonPressed() override;
    void resized() override;

    void activeWindowStatusChanged() override;

    int getDesktopWindowStyleFlags() const override
    {
        return DocumentWindow::getDesktopWindowStyleFlags();
        // | ComponentPeer::windowHasCloseButton | ComponentPeer::windowHasTitleBar | ComponentPeer::windowHasDropShadow;
    }

protected:
    PluginWindow (GuiService&, Component* const uiComp, const Node& node);

private:
    GuiService& gui;
    friend class WindowManager;
    Processor* owner;
    Node node;
    Value name;

    struct DelayedNodeFocus : public Timer
    {
        DelayedNodeFocus (PluginWindow& w) : window (w) {}
        void timerCallback() override;
        void trigger (int millis = 100) { startTimer (millis); }

        PluginWindow& window;
    } delayedNodeFocus;

    void valueChanged (Value& value) override
    {
        if (value.refersToSameSourceAs (name))
            setName (node.getDisplayName());
    }
};

} // namespace element
