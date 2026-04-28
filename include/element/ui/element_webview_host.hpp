// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/context.hpp>
#include <element/juce/gui_basics.hpp>
#include <element/juce/gui_extra.hpp>
#include <element/web_metering_fifo.hpp>

#include <functional>
#include <memory>
#include <string>
#include <unordered_map>

namespace element {

#if JUCE_WEB_BROWSER

class WebContent;
struct ElementWebViewLogForwarder;

//==============================================================================
/**
    Hosts JUCE WebBrowserComponent with ResourceProvider, native functions, and a 60Hz timer
    that forwards metering + graph state to the React bundle.
*/
class ElementWebViewHost final : public juce::Component,
                                 private juce::Timer,
                                 private juce::ValueTree::Listener {
public:
    /** If skipBrowser is true, the WebBrowserComponent is not created (used only by unit tests). */
    explicit ElementWebViewHost (Context& ctx, bool skipBrowser = false);
    ~ElementWebViewHost() override;

    Context& getContext() const { return context; }

    /** Parent shell (optional) — used for overlay views opened from bridge natives. */
    void setWebShell (WebContent* shell) noexcept { webShell = shell; }

    WebMeteringFifo& getMeteringFifo() noexcept { return metering; }

    /** Called from the audio thread — must be wait-free (delegates to metering FIFO). */
    void submitAudioPeak (float peak) noexcept { metering.pushPacket (peak); }

    void pushGraphSnapshot();
    void pushMeteringIfNeeded();

    /** Plugin UI embedded above the browser (same coordinate space as WebBrowserComponent). */
    void pluginEditorOpen (const juce::String& nodeUuid, int x, int y, int w, int h);
    void pluginEditorClose();
    void pluginEditorSetBounds (int x, int y, int w, int h);
    /** Detach to a floating PluginWindow and hide the embed slot. */
    void pluginEditorFloat();

    void paintChildrenWithUnifiedOrigin (juce::Graphics&) const { /* WebView handles itself */ }

    /** @internal */
    void resized() override;
    void visibilityChanged() override;

    // ── Test-harness support ─────────────────────────────────────────────────
    /** Callable type matching opts.withNativeFunction lambda signature. */
    using BridgeFn = std::function<void (const juce::Array<juce::var>&,
                                         std::function<void (const juce::var&)>)>;

    /** Invoke a registered bridge function by name and collect the result
        synchronously (blocks the calling thread until the completion callback
        fires on the message thread).  Used only by BridgeContractTest.
        Returns var::undefined if the name is not found. */
    juce::var invokeForTest (const juce::String& name, const juce::Array<juce::var>& args);

private:
    friend struct ElementWebViewLogForwarder;
    friend class BridgeContractTest;

    void timerCallback() override;
    void valueTreePropertyChanged (juce::ValueTree&, const juce::Identifier&) override;
    void valueTreeChildAdded (juce::ValueTree&, juce::ValueTree&) override;
    void valueTreeChildRemoved (juce::ValueTree&, juce::ValueTree&, int) override;
    void valueTreeChildOrderChanged (juce::ValueTree&, int, int) override;
    void valueTreeParentChanged (juce::ValueTree&) override;
    void valueTreeRedirected (juce::ValueTree&) override;

    void attachSessionListener();
    void detachSessionListener();
    void scheduleGraphPush (int debounceMs = 40);

    bool isUnderActiveGraph (const juce::ValueTree& start) const;
    bool shouldIgnoreSessionRootProperty (const juce::Identifier& prop) const;

    juce::String buildActiveGraphJson() const;
    /** Per-cable levels for Web §2.4 (message thread; reads processor RMS / MIDI activity). */
    juce::String buildCableLevelsJson() const;
    juce::String buildPluginListJson() const;
    juce::String buildNodeParametersJson (const juce::String& nodeUuid) const;
    bool setNodeParameterValue (const juce::String& nodeUuid, int paramIndex, float value);

    /** Push 15Hz delta of changed AudioProcessorParameter values to the WebView.
        Walks the active graph, polls all node parameters, diffs against the cached
        last-pushed value (epsilon 1e-4f), and emits a compact JSON array via
        `window.__elementNative.onParameterUpdate(...)`. Called from `timerCallback`
        every 4th tick. Cache is pruned of stale node entries on each push so it
        cannot grow unbounded across session changes. */
    void pushParameterUpdates();

    void evalInBrowser (const juce::String& js);

    Context& context;
    WebContent* webShell = nullptr;
    std::unique_ptr<ElementWebViewLogForwarder> logForwarder;
    std::unique_ptr<juce::WebBrowserComponent> browser;
    WebMeteringFifo metering;

    juce::ValueTree attachedSessionRoot;
    bool listenerAttached = false;
    int graphPushPendingMs = 0;

    /** UUIDs last stored by `elementGraphCopyNodes` for `elementGraphPasteNodes` (host-side pasteboard). */
    juce::StringArray graphCopyPasteboard;

    /** Last `SessionService::hasSessionChanged()` pushed to the Web snapshot (for ~2Hz dirty refresh). */
    bool lastPushedSessionDirty = false;
    int dirtyPollCounter = 0;

    /** 15Hz parameter delta channel: counter ticks every 60Hz callback, push every 4th. */
    int parameterPushCounter = 0;
    /** Cache of last-pushed parameter values keyed by "<uuid>:<paramIndex>". */
    std::unordered_map<std::string, float> lastPushedParamValues;

    bool logPushPending = false;
    int lastLogHistorySize = 0;

    std::unique_ptr<juce::Component> pluginEmbedEditor;
    juce::Rectangle<int> pluginEmbedBounds;
    juce::String pluginEmbedNodeUuid;

    /** Map of registered bridge function name → callable.
        Populated during construction alongside opts.withNativeFunction so
        that BridgeContractTest can invoke functions without a live browser. */
    std::unordered_map<std::string, BridgeFn> bridgeFunctions;

    void rebuildPluginEmbedLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ElementWebViewHost)
};

#endif // JUCE_WEB_BROWSER

} // namespace element
