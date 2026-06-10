// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Separate-window plugin editor — worker-side lifecycle (cross-platform JUCE).
// See sandboxeditorwindow.hpp for the design rationale.

#include "engine/sandboxeditorwindow.hpp"

namespace element {

#if ! JUCE_MAC
// macOS provides this in sandboxeditorwindow_mac.mm; elsewhere the WindowServer
// equivalent isn't needed (DocumentWindow::toFront already raises the window).
void sandboxWorkerActivateForEditor() {}
#endif

namespace sandbox_editor_window {

namespace {
    std::unique_ptr<SandboxEditorWindow> g_window;
    std::function<void()> g_userCloseCallback;
}

void setUserCloseCallback (std::function<void()> cb)
{
    g_userCloseCallback = std::move (cb);
}

bool hasOpenEditorWindow()
{
    return g_window != nullptr;
}

void closeEditorWindow()
{
    jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
    // Destroying the DocumentWindow detaches + deletes the owned editor; the
    // worker calls this BEFORE releasing the processor (see sandboxworker.hpp).
    g_window.reset();
}

bool openEditorWindow (juce::AudioProcessor* proc, int x, int y, int& outW, int& outH)
{
    jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
    outW = outH = 0;

    if (proc == nullptr)
        return false;

    // Replace any window already open for this worker's single plugin.
    closeEditorWindow();

    if (! proc->hasEditor())
    {
        // No custom editor. A generic parameter editor would also work, but the
        // sandbox already exposes parameters to the host inspector; the
        // separate-window path is for plugins with their own UI.
        juce::Logger::writeToLog ("[sandbox-editor-window] plugin has no custom editor");
        return false;
    }

    auto* editor = proc->createEditorIfNeeded();
    if (editor == nullptr)
    {
        juce::Logger::writeToLog ("[sandbox-editor-window] createEditorIfNeeded returned null");
        return false;
    }

    // Build the window first — the SandboxEditorWindow constructor calls
    // setContentOwned(editor, true) which sizes the window to the editor's
    // current bounds (synchronous case) AND attaches a ComponentListener that
    // tracks future async resizes (e.g. AU NSView layout after attachment).
    auto window = std::make_unique<SandboxEditorWindow> (editor, proc->getName());
    window->onUserClose = []
    {
        if (g_userCloseCallback)
            g_userCloseCallback();
    };

    // Position near the originating Block (host passes global screen coords).
    if (x != 0 || y != 0)
        window->setTopLeftPosition (x, y);
    else
        window->centreWithSize (window->getWidth(), window->getHeight());

    window->setVisible (true);
    window->addToDesktop (window->getDesktopWindowStyleFlags());
    window->toFront (true);

    g_window = std::move (window);

    // Bring the dock-hidden worker process forward so the window is visible +
    // can take key focus (no-op off macOS).
    sandboxWorkerActivateForEditor();

    // Report the window's current size (which equals the editor's synchronous
    // size after setContentOwned).  If the editor reports real bounds only after
    // an async layout pass, the ComponentListener in SandboxEditorWindow will
    // resize the window then; outW/outH here are the best-available initial
    // values, not a hardcoded fallback.
    outW = g_window->getWidth();
    outH = g_window->getHeight();

    juce::Logger::writeToLog ("[sandbox-editor-window] editor window open, initial size "
                              + juce::String (outW) + "x" + juce::String (outH));
    return true;
}

} // namespace sandbox_editor_window
} // namespace element
