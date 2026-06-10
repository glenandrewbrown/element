// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Separate-window plugin editor — WORKER SIDE (the REAPER model).
//
// The sandbox worker process already hosts the real juce::AudioPluginInstance
// (see sandboxworker.hpp). This adds the editor surface the SHIPPING way: the
// worker creates the plugin's AudioProcessorEditor and shows it in its OWN
// juce::DocumentWindow — a real OS window the WindowServer composites normally.
//
// Why this and not the embedded-in-canvas CALayerHost mirror: cross-process
// IOSurface -> CAContext -> CALayerHost pixel propagation did not display
// (see .omo/EDITOR-EMBED-FOLLOWUP.md "The WALL"). Showing the worker's own
// window directly needs no private SPI, no pixel mirroring and no input
// forwarding — the OS routes events to the worker's window. Crash isolation is
// preserved: the editor lives in the worker, so a plugin crash takes the window
// down with the worker and the host survives.
//
// This is pure JUCE (DocumentWindow is cross-platform). The only platform hook
// is bringing a dock-hidden worker process's window to the front + giving it key
// focus, which lives in sandboxeditorwindow_mac.mm (no-op elsewhere).

#pragma once

#include <element/juce/gui_basics.hpp>
#include <element/juce/audio_processors.hpp>
#include <functional>
#include <memory>

namespace element {

//==============================================================================
/** Platform hook: pin the sandbox worker process to a non-foreground activation
    policy (macOS NSApplicationActivationPolicyProhibited). The worker is a
    re-exec of the same Element Mach-O under the same bundle id; if it ever
    registers as a foreground app, macOS duplicate-instance enforcement SIGKILLs
    an Element process and can take the host down. Call once, early, in the
    worker init path. No-op off macOS. Defined in sandboxeditorwindow_mac.mm. */
void sandboxWorkerSetAccessoryPolicy();

/** Platform hook: activate the worker app to Accessory so a newly-shown editor
    window comes to the front and can take key focus, WITHOUT making the worker a
    foreground (Regular) app — Regular trips the duplicate-instance SIGKILL.
    No-op off macOS. Defined in sandboxeditorwindow_mac.mm. */
void sandboxWorkerActivateForEditor();

//==============================================================================
/** Owns the worker-side plugin editor window. One instance per worker (the
    sandbox hosts a single plugin). Message-thread only — AudioProcessorEditor +
    DocumentWindow are not thread-safe. */
class SandboxEditorWindow final : public juce::DocumentWindow,
                                  private juce::ComponentListener
{
public:
    /** Called when the user closes the window (close button). */
    std::function<void()> onUserClose;

    SandboxEditorWindow (juce::AudioProcessorEditor* editor, const juce::String& title)
        : juce::DocumentWindow (title.isNotEmpty() ? title : juce::String ("Plugin"),
                                juce::Colour (0xff1e1e22),
                                juce::DocumentWindow::minimiseButton
                                    | juce::DocumentWindow::closeButton,
                                false)
    {
        jassert (editor != nullptr);
        setUsingNativeTitleBar (true);

        const bool resizable = editor->isResizable();
        // setContentOwned takes ownership of the editor and sizes the window to
        // the editor's current bounds (synchronous case). For AU/VST editors
        // that resize asynchronously after the view attaches, we also install a
        // ComponentListener and track further size changes in
        // componentMovedOrResized below.
        setContentOwned (editor, true);
        setResizable (resizable, false);
        setAlwaysOnTop (false);

        // Attach AFTER setContentOwned so we don't fire for the initial layout.
        editor->addComponentListener (this);
    }

    ~SandboxEditorWindow() override
    {
        detachEditorListener();
        clearContentComponent();
    }

    void closeButtonPressed() override
    {
        if (onUserClose)
            onUserClose();
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxEditorWindow)

private:
    int lastEditorW = -1, lastEditorH = -1;
    bool resizingFromListener = false;

    // Detach the ComponentListener from the current content editor, if any.
    // Must be called before clearContentComponent() and in the destructor.
    void detachEditorListener()
    {
        if (auto* editor = dynamic_cast<juce::AudioProcessorEditor*> (getContentComponent()))
            editor->removeComponentListener (this);
    }

    // juce::ComponentListener — called on the message thread whenever the
    // editor moves or resizes (e.g. AU async layout after NSView attachment).
    void componentMovedOrResized (juce::Component& component, bool /*wasMoved*/, bool wasResized) override
    {
        if (! wasResized)
            return;

        const int w = component.getWidth();
        const int h = component.getHeight();
        if (w <= 0 || h <= 0)
            return;

        // Coalesce: a heavy plugin (Kontakt) fires a burst of identical resizes
        // during its async layout pass. Without this guard each one drives setSize()
        // -> DocumentWindow relayout -> editor NSView relayout, which can re-fire
        // this listener, thrashing the message thread and making open/close feel
        // "unusably slow" (live bug, 2026-06-10). Skip no-op size changes.
        if (w == lastEditorW && h == lastEditorH)
            return;
        lastEditorW = w;
        lastEditorH = h;

        // Re-entrancy guard: setSize() may synchronously bounce back through the
        // editor's resized() -> this listener. Ignore the nested callback.
        if (resizingFromListener)
            return;
        const juce::ScopedValueSetter<bool> guard (resizingFromListener, true);

        // Resize the DocumentWindow to wrap the editor's new size.
        setSize (w + getContentComponentBorder().getLeftAndRight(),
                 h + getContentComponentBorder().getTopAndBottom() + getTitleBarHeight());
        juce::Logger::writeToLog ("[sandbox-editor-window] async resize -> "
                                  + juce::String (w) + "x" + juce::String (h));
    }

    // Called when the editor component itself is destroyed before the window
    // (should not happen in normal flow, but guard defensively).
    void componentBeingDeleted (juce::Component& component) override
    {
        component.removeComponentListener (this);
    }
};

//==============================================================================
/** Worker-side editor lifecycle. All methods MUST be called on the message
    thread (SandboxWorker marshals coordinator messages there before calling). */
namespace sandbox_editor_window {

/** Create + show the plugin editor in its own window at the requested screen
    position. Returns true and fills outW/outH with the editor's size; false if
    the plugin/editor could not be created. Replaces any window already open. */
bool openEditorWindow (juce::AudioProcessor* proc, int x, int y, int& outW, int& outH);

/** Close + destroy the editor window if one is open. Safe to call when nothing
    is open. */
void closeEditorWindow();

/** True if an editor window is currently open. */
bool hasOpenEditorWindow();

/** Install a callback invoked (message thread) when the USER closes the window,
    so the worker can notify the host (EditorWindowClosed). */
void setUserCloseCallback (std::function<void()> cb);

} // namespace sandbox_editor_window
} // namespace element
