// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/context.hpp>
#include <element/juce/gui_basics.hpp>
#include <element/juce/gui_extra.hpp>
#include <element/web_metering_fifo.hpp>

#include <memory>

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
    explicit ElementWebViewHost (Context& ctx);
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

private:
    friend struct ElementWebViewLogForwarder;

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

    bool logPushPending = false;
    int lastLogHistorySize = 0;

    std::unique_ptr<juce::Component> pluginEmbedEditor;
    juce::Rectangle<int> pluginEmbedBounds;
    juce::String pluginEmbedNodeUuid;

    void rebuildPluginEmbedLayout();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ElementWebViewHost)
};

#endif // JUCE_WEB_BROWSER

} // namespace element
