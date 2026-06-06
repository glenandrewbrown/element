// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <set>

#include <element/ui/popups.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>
#include <element/ui/content.hpp>
#include <element/ui/navigation.hpp>

#include "engine/graphmanager.hpp"
#include "nodes/baseprocessor.hpp"
#include "nodes/audioprocessor.hpp"
#include "presetmanager.hpp"
#include "ui/datapathbrowser.hpp"
#include "ui/guicommon.hpp"
#include "ui/block.hpp"
#include "ui/blockutils.hpp"
#include "ui/contextmenus.hpp"
#include "ui/icons.hpp"
#include "ui/pluginwindow.hpp"
#include "ui/nodeeditorview.hpp"
#include "ui/graphsettingsview.hpp"
#include "ui/nodepropertiesview.hpp"
#include "ui/pluginspanelview.hpp"
#include "ui/sessiontreepanel.hpp"
#include "ui/audioiopanelview.hpp"
#include "ui/grapheditorcomponent.hpp"

#include "scopedflag.hpp"

// midi mon. block
#include "nodes/midimonitor.hpp"
#include "ui/midiblinker.hpp"

// For signal activity visualization
#include "engine/graphnode.hpp"

// For molecule support
#include "ui/moleculemanager.hpp"

#include "verbose_log.hpp"

namespace element {

//=============================================================================
// Helper to get color for a port type
static Colour getColorForPortType (PortType type)
{
    switch (type.id())
    {
        case PortType::Audio:
            return Colours::lightgreen;
        case PortType::Control:
            return Colours::lightblue;
        case PortType::CV:
            return Colours::cyan;
        case PortType::Midi:
            return Colours::orange;
        case PortType::Atom:
            return Colours::orange.brighter (0.2f);
        case PortType::Event:
            return Colours::yellow;
        default:
            break;
    }
    return Colours::grey;
}

//==============================================================================
class MidiMonitorBlock : public BlockComponent
{
public:
    MidiMonitorBlock() = delete;
    explicit MidiMonitorBlock (const Node& node, bool vertical)
        : BlockComponent (node.getParentGraph(), node, vertical)
    {
        mmnode = dynamic_cast<MidiMonitorNode*> (node.getObject());
        if (auto n = mmnode)
        {
            loggedConn = n->messagesLogged.connect ([this]() { onLogged(); });
        }
        addAndMakeVisible (blinker);
        blinker.setInputOutputVisibility (true, false);
    }

    ~MidiMonitorBlock()
    {
        loggedConn.disconnect();
    }

    void resized() override
    {
        BlockComponent::resized();

        if (getDisplayMode() != BlockComponent::Compact)
        {
            blinker.setVisible (true);
            auto r = getLocalBounds();
            r.removeFromTop (vPad);
            r.removeFromLeft (hPad);
            r = r.removeFromTop (vSize);
            r = r.removeFromLeft (hSize);
            blinker.setBounds (r);
        }
        else
        {
            blinker.setVisible (false);
        }
    }

private:
    ReferenceCountedObjectPtr<MidiMonitorNode> mmnode;
    boost::signals2::connection loggedConn;
    MidiBlinker blinker;
    int vSize = 18,
        hSize = 18,
        vPad = 4,
        hPad = 4;
    void onLogged() { blinker.triggerReceived(); }
};

//==============================================================================
class DefaultBlockFactory : public BlockFactory
{
public:
    DefaultBlockFactory (Context& c, GraphEditorComponent& e)
        : context (c), editor (e) {}

    BlockComponent* createBlockComponent (const Node& node) override
    {
        BlockComponent* block { nullptr };
        if (node.isA (EL_NODE_FORMAT_NAME, EL_NODE_ID_MIDI_MONITOR))
        {
            block = new MidiMonitorBlock (node, editor.isLayoutVertical());
        }
        else
        {
            block = new BlockComponent (node.getParentGraph(), node, editor.isLayoutVertical());
        }

        detail::updateBlockButtonVisibility (*block, node);
        return block;
    }

private:
    [[maybe_unused]] Context& context;
    GraphEditorComponent& editor;
};

//=============================================================================
class ConnectorComponent : public Component,
                           public SettableTooltipClient,
                           public DragAndDropTarget
{
public:
    ConnectorComponent (const Node& g)
        : sourceFilterID (0), destFilterID (0), sourceFilterChannel (0), destFilterChannel (0), graph (g), lastInputX (0), lastInputY (0), lastOutputX (0), lastOutputY (0)
    {
    }

    ~ConnectorComponent()
    {
    }

    bool isDragging() const { return dragging; }
    void setGraph (const Node& g) { graph = g; }

    void setInput (const uint32 sourceFilterID_, const int sourceFilterChannel_)
    {
        if (sourceFilterID != sourceFilterID_ || sourceFilterChannel != sourceFilterChannel_)
        {
            sourceFilterID = sourceFilterID_;
            sourceFilterChannel = sourceFilterChannel_;
            updatePortType();
            update();
        }
    }

    /** Update the port type based on the source node's port */
    void updatePortType()
    {
        if (sourceFilterID == 0 || ! graph.isValid())
            return;

        Node srcNode = graph.getNodeById (sourceFilterID);
        if (srcNode.isValid())
        {
            Port port = srcNode.getPort (sourceFilterChannel);
            if (port.data().isValid())
            {
                portType = port.getType();
            }
        }
    }

    void setOutput (const uint32 destFilterID_, const int destFilterChannel_)
    {
        if (destFilterID != destFilterID_ || destFilterChannel != destFilterChannel_)
        {
            destFilterID = destFilterID_;
            destFilterChannel = destFilterChannel_;
            update();
        }
    }

    void dragStart (int x, int y)
    {
        lastInputX = (float) x;
        lastInputY = (float) y;
        resizeToFit();
    }

    void dragEnd (int x, int y)
    {
        lastOutputX = (float) x;
        lastOutputY = (float) y;
        resizeToFit();
    }

    void update()
    {
        float x1, y1, x2, y2;
        getPoints (x1, y1, x2, y2);

        if (lastInputX != x1
            || lastInputY != y1
            || lastOutputX != x2
            || lastOutputY != y2)
        {
            resizeToFit();
        }
    }

    void resizeToFit()
    {
        float x1, y1, x2, y2;
        getPoints (x1, y1, x2, y2);

        const Rectangle<int> newBounds ((int) jmin (x1, x2) - 4,
                                        (int) jmin (y1, y2) - 4,
                                        (int) fabsf (x1 - x2) + 8,
                                        (int) fabsf (y1 - y2) + 8);
        setBounds (newBounds);
        repaint();
    }

    bool getPoints (float& x1, float& y1, float& x2, float& y2) const
    {
        bool sres = false, dres = false;

        x1 = lastInputX;
        y1 = lastInputY;
        x2 = lastOutputX;
        y2 = lastOutputY;

        if (GraphEditorComponent* const hostPanel = getGraphPanel())
        {
            if (auto* srcBlock = hostPanel->getComponentForFilter (sourceFilterID))
                sres = srcBlock->getPortPos (sourceFilterChannel, false, x1, y1);

            if (auto* dstBlock = hostPanel->getComponentForFilter (destFilterID))
                dres = dstBlock->getPortPos (destFilterChannel, true, x2, y2);
        }

        return sres && dres;
    }

    void paint (Graphics& g) override
    {
        // Get the port type color for this connection
        auto c = getCableColor();

        // Apply hover/drag brightness
        if (hover || dragging)
            c = c.brighter (0.25f);

        // Highlight when plugin is being dragged over this connector
        if (dragHover)
        {
            c = Colours::cyan.brighter (0.3f);
            // Draw a wider highlight to show insertion point
            g.setColour (Colours::cyan.withAlpha (0.3f));
            PathStrokeType highlightStroke (8.0f);
            Path highlightPath;
            highlightStroke.createStrokedPath (highlightPath, linePath);
            g.fillPath (highlightPath);
        }

        // Apply signal activity visualization
        // Animate cable brightness/saturation based on signal level
        if (signalActivity > 0.001f)
        {
            // Enhanced pulse effect - more visible brightness change
            float pulseIntensity = jlimit (0.0f, 1.0f, signalActivity);
            c = c.brighter (pulseIntensity * 0.7f);

            // Add glow outline for active cables
            if (signalActivity > 0.1f)
            {
                g.setColour (c.brighter (0.5f).withAlpha (signalActivity * 0.5f));
                PathStrokeType glowStroke (6.0f + signalActivity * 6.0f);
                Path glowPath;
                glowStroke.createStrokedPath (glowPath, linePath);
                g.fillPath (glowPath);
            }
        }

        // Draw the main cable
        g.setColour (c);
        g.fillPath (linePath);

        // Draw glow effect and flow visualization for active audio signals
        if (signalActivity > 0.02f && portType.isAudio())
        {
            float x1, y1, x2, y2;
            getPoints (x1, y1, x2, y2);
            x1 -= getX();
            y1 -= getY();
            x2 -= getX();
            y2 -= getY();

            // Draw pulsing glow that moves from source to destination
            const float phase = static_cast<float> (Time::getMillisecondCounter() % 2000) / 2000.0f;
            const bool vertical = getGraphPanel() != nullptr && getGraphPanel()->isLayoutVertical();

            // Draw multiple glow pulses flowing along the cable
            const int numPulses = 3;
            for (int p = 0; p < numPulses; ++p)
            {
                float pulseT = fmodf (phase + p / static_cast<float> (numPulses), 1.0f);

                // Calculate pulse position along path
                float pulseX, pulseY;
                if (vertical)
                {
                    pulseX = x1 + (x2 - x1) * pulseT;
                    pulseY = y1 + (y2 - y1) * pulseT;
                }
                else
                {
                    pulseX = x1 + (x2 - x1) * pulseT;
                    pulseY = y1 + (y2 - y1) * pulseT;
                }

                // Pulse alpha based on position and signal level - more visible
                float pulseAlpha = signalActivity * 0.7f * (1.0f - std::abs (pulseT - 0.5f) * 1.2f);
                pulseAlpha = jlimit (0.0f, 0.8f, pulseAlpha);

                // Draw larger, more visible glow circle at pulse position
                float pulseSize = 16.0f + signalActivity * 14.0f;
                g.setColour (c.brighter (0.5f).withAlpha (pulseAlpha));
                g.fillEllipse (pulseX - pulseSize / 2.0f, pulseY - pulseSize / 2.0f, pulseSize, pulseSize);

                // Draw inner bright core
                float coreSize = pulseSize * 0.5f;
                g.setColour (Colours::white.withAlpha (pulseAlpha * 0.8f));
                g.fillEllipse (pulseX - coreSize / 2.0f, pulseY - coreSize / 2.0f, coreSize, coreSize);
            }

            // Draw direction arrow for audio when active
            if (signalActivity > 0.08f)
            {
                drawFlowArrow (g, x1, y1, x2, y2);
            }
        }

        // Draw MIDI activity indicator (animated dots traveling along cable)
        if (portType.isMidi() && midiActivityCounter > 0)
        {
            drawMidiActivityIndicator (g);
        }
    }

    /** Get the appropriate color based on port type */
    Colour getCableColor() const
    {
        return getColorForPortType (portType);
    }

    /** Draw animated flow direction indicator for MIDI signals.
        Shows traveling dots that move from source to destination,
        clearly indicating signal flow direction. */
    void drawMidiActivityIndicator (Graphics& g) const
    {
        float x1, y1, x2, y2;
        getPoints (x1, y1, x2, y2);
        x1 -= getX();
        y1 -= getY();
        x2 -= getX();
        y2 -= getY();

        // Calculate path length for proper spacing
        const float pathLength = std::sqrt ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
        if (pathLength < 20.0f)
            return; // Too short to animate

        // Use time-based animation for smooth flow (direction: source -> destination)
        const float phase = static_cast<float> (Time::getMillisecondCounter() % 1000) / 1000.0f;

        // Draw multiple traveling dots (spaced evenly)
        const int numDots = jmax (2, static_cast<int> (pathLength / 40.0f));
        const float dotSpacing = 1.0f / static_cast<float> (numDots);

        g.setColour (Colours::white);

        for (int i = 0; i < numDots; ++i)
        {
            // Calculate position along path (0.0 to 1.0)
            float t = fmodf (phase + i * dotSpacing, 1.0f);

            // Bezier curve for smooth cable path
            const bool vertical = getGraphPanel() != nullptr && getGraphPanel()->isLayoutVertical();
            float px, py;
            if (vertical)
            {
                float cp1y = y1 + (y2 - y1) * 0.33f;
                float cp2y = y1 + (y2 - y1) * 0.66f;
                // Cubic bezier interpolation
                float u = 1.0f - t;
                float u2 = u * u;
                float u3 = u2 * u;
                float t2 = t * t;
                float t3 = t2 * t;
                px = u3 * x1 + 3 * u2 * t * x1 + 3 * u * t2 * x2 + t3 * x2;
                py = u3 * y1 + 3 * u2 * t * cp1y + 3 * u * t2 * cp2y + t3 * y2;
            }
            else
            {
                float cp1x = x1 + (x2 - x1) * 0.33f;
                float cp2x = x1 + (x2 - x1) * 0.66f;
                float u = 1.0f - t;
                float u2 = u * u;
                float u3 = u2 * u;
                float t2 = t * t;
                float t3 = t2 * t;
                px = u3 * x1 + 3 * u2 * t * cp1x + 3 * u * t2 * cp2x + t3 * x2;
                py = u3 * y1 + 3 * u2 * t * y1 + 3 * u * t2 * y2 + t3 * y2;
            }

            // Size varies by position (larger in middle, smaller at ends)
            float sizeFactor = 1.0f - std::abs (t - 0.5f) * 0.5f;
            float dotSize = 4.0f * sizeFactor;

            // Alpha fades at start and end
            float alpha = jmin (1.0f, jmin (t * 4.0f, (1.0f - t) * 4.0f));
            g.setColour (Colours::white.withAlpha (0.8f * alpha));
            g.fillEllipse (px - dotSize / 2.0f, py - dotSize / 2.0f, dotSize, dotSize);
        }

        // Draw direction arrow at destination end
        drawFlowArrow (g, x1, y1, x2, y2);
    }

    /** Draw a small arrow indicating flow direction at destination */
    void drawFlowArrow (Graphics& g, float x1, float y1, float x2, float y2) const
    {
        // Calculate direction vector
        float dx = x2 - x1;
        float dy = y2 - y1;
        float len = std::sqrt (dx * dx + dy * dy);
        if (len < 1.0f)
            return;

        dx /= len;
        dy /= len;

        // Arrow position (near destination, but not at the very end)
        const float arrowPos = 0.85f;
        float ax = x1 + (x2 - x1) * arrowPos;
        float ay = y1 + (y2 - y1) * arrowPos;

        // Arrow size
        const float arrowSize = 6.0f;

        // Perpendicular vector for arrow wings
        float px = -dy * arrowSize * 0.5f;
        float py = dx * arrowSize * 0.5f;

        // Draw arrow
        Path arrow;
        arrow.startNewSubPath (ax + dx * arrowSize, ay + dy * arrowSize); // Tip
        arrow.lineTo (ax + px, ay + py); // Left wing
        arrow.lineTo (ax - px, ay - py); // Right wing
        arrow.closeSubPath();

        g.setColour (Colours::white.withAlpha (0.7f));
        g.fillPath (arrow);
    }

    bool hitTest (int x, int y) override
    {
        if (hitPath.contains ((float) x, (float) y))
        {
            double distanceFromStart, distanceFromEnd;
            getDistancesFromEnds (x, y, distanceFromStart, distanceFromEnd);

            // avoid clicking the connector when over a pin
            return distanceFromStart > 7.0 && distanceFromEnd > 7.0;
        }

        return false;
    }

    void mouseEnter (const MouseEvent&) override
    {
        if (hover)
            return;
        hover = true;
        repaint();
    }

    void mouseExit (const MouseEvent&) override
    {
        if (! hover)
            return;
        hover = false;
        repaint();
    }

    void mouseDown (const MouseEvent&) override
    {
        if (! isEnabled())
            return;
        dragging = false;
    }

    void mouseDrag (const MouseEvent& e) override
    {
        if (! isEnabled())
            return;

        if ((! dragging) && ! e.mouseWasClicked())
        {
            dragging = true;
            repaint();

            double distanceFromStart, distanceFromEnd;
            getDistancesFromEnds (e.x, e.y, distanceFromStart, distanceFromEnd);
            const bool isNearerSource = (distanceFromStart < distanceFromEnd);
            ViewHelpers::postMessageFor (this, new RemoveConnectionMessage (sourceFilterID, (uint32) sourceFilterChannel, destFilterID, (uint32) destFilterChannel, graph));

            getGraphPanel()->beginConnectorDrag (isNearerSource ? 0 : sourceFilterID, sourceFilterChannel, isNearerSource ? destFilterID : 0, destFilterChannel, e);
        }
        else if (dragging)
        {
            getGraphPanel()->dragConnector (e);
        }
    }

    void mouseUp (const MouseEvent& e) override
    {
        if (! isEnabled())
            return;
        if (dragging)
            getGraphPanel()->endDraggingConnector (e);
    }

    void resized() override
    {
        float x1, y1, x2, y2;
        getPoints (x1, y1, x2, y2);

        lastInputX = x1;
        lastInputY = y1;
        lastOutputX = x2;
        lastOutputY = y2;

        x1 -= getX();
        y1 -= getY();
        x2 -= getX();
        y2 -= getY();

        linePath.clear();
        linePath.startNewSubPath (x1, y1);
        const bool vertical = getGraphPanel()->isLayoutVertical();

        if (vertical)
        {
            linePath.cubicTo (x1, y1 + (y2 - y1) * 0.33f, x2, y1 + (y2 - y1) * 0.66f, x2, y2);
        }
        else
        {
            linePath.cubicTo (x1 + (x2 - x1) * 0.33f, y1, x1 + (x2 - x1) * 0.66f, y2, x2, y2);
        }

        PathStrokeType wideStroke (8.0f);
        wideStroke.createStrokedPath (hitPath, linePath);

        PathStrokeType stroke (2.5f);
        stroke.createStrokedPath (linePath, linePath);

        const bool showArrow = false;

        if (showArrow)
        {
            const float arrowW = 5.0f;
            const float arrowL = 4.0f;

            Path arrow;
            arrow.addTriangle (-arrowL, arrowW, -arrowL, -arrowW, arrowL, 0.0f);

            arrow.applyTransform (AffineTransform()
                                      .rotated (MathConstants<float>::pi * 0.5f - (float) atan2 (x2 - x1, y2 - y1))
                                      .translated ((x1 + x2) * 0.5f,
                                                   (y1 + y2) * 0.5f));

            linePath.addPath (arrow);
        }

        linePath.setUsingNonZeroWinding (true);
    }

    uint32 sourceFilterID { EL_INVALID_PORT },
        destFilterID { EL_INVALID_PORT };
    int sourceFilterChannel, destFilterChannel;

private:
    Node graph;
    float lastInputX, lastInputY, lastOutputX, lastOutputY;
    Path linePath, hitPath;
    bool dragging { false };
    bool hover { false };

    // Port type for color coding
    PortType portType { PortType::Audio };

    // Signal activity visualization
    float signalActivity { 0.0f };
    int midiActivityCounter { 0 };
    float signalDecay { 0.85f }; // Decay rate for signal visualization

    GraphEditorComponent* getGraphPanel() const noexcept
    {
        return findParentComponentOfClass<GraphEditorComponent>();
    }

    void getDistancesFromEnds (int x, int y, double& distanceFromStart, double& distanceFromEnd) const
    {
        float x1, y1, x2, y2;
        getPoints (x1, y1, x2, y2);

        distanceFromStart = juce_hypot (x - (x1 - getX()), y - (y1 - getY()));
        distanceFromEnd = juce_hypot (x - (x2 - getX()), y - (y2 - getY()));
    }

public:
    /** Update signal activity from the source node's processor */
    void updateSignalActivity()
    {
        if (sourceFilterID == 0 || ! graph.isValid())
        {
            // Decay the signal
            signalActivity *= signalDecay;
            if (midiActivityCounter > 0)
                --midiActivityCounter;
            if (signalActivity > 0.001f || midiActivityCounter > 0)
                repaint();
            return;
        }

        Node srcNode = graph.getNodeById (sourceFilterID);
        if (! srcNode.isValid())
        {
            signalActivity *= signalDecay;
            if (signalActivity > 0.001f)
                repaint();
            return;
        }

        // Get the processor to read signal levels
        if (auto* proc = srcNode.getObject())
        {
            float newActivity = 0.0f;

            if (portType.isAudio())
            {
                // For audio, get the actual output RMS level from the processor
                // The port index corresponds to the output channel
                int numOutputs = proc->getNumAudioOutputs();

                // Map the port channel to the audio output channel
                // sourceFilterChannel is the port index, need to find the actual channel
                auto portDesc = proc->getPort (sourceFilterChannel);
                int channel = portDesc.channel;

                if (channel >= 0 && channel < numOutputs)
                {
                    // Get the actual RMS output level from the processor
                    newActivity = proc->getOutputRMS (channel);

                    // Scale for better visual display (RMS values can be quite small)
                    newActivity = jmin (1.0f, newActivity * 3.0f);
                }
                else if (numOutputs > 0)
                {
                    // Fallback: average all output channels
                    float totalRms = 0.0f;
                    for (int i = 0; i < numOutputs; ++i)
                        totalRms += proc->getOutputRMS (i);
                    newActivity = jmin (1.0f, (totalRms / numOutputs) * 3.0f);
                }
            }
            else if (portType.isMidi())
            {
                // Check actual MIDI activity from processor
                bool hasMidiActivity = false;

                // Check source processor for output MIDI activity
                // Note: Activity is cleared by the engine at start of each buffer
                if (proc->hasMidiOutputActivity())
                {
                    hasMidiActivity = true;
                }

                // Check destination processor for input MIDI activity
                if (destFilterID != 0)
                {
                    Node dstNode = graph.getNodeById (destFilterID);
                    if (dstNode.isValid())
                    {
                        if (auto* dstProc = dstNode.getObject())
                        {
                            if (dstProc->hasMidiInputActivity())
                            {
                                hasMidiActivity = true;
                            }
                        }
                    }
                }

                if (hasMidiActivity)
                {
                    // Trigger MIDI activity animation
                    if (midiActivityCounter <= 0)
                        midiActivityCounter = 15;
                    newActivity = 0.6f;
                }
                // Note: Removed baseline activity code that caused permanent glow
            }
            else if (portType.isControl())
            {
                // Control ports only show activity when there's actual signal
                // Note: Removed baseline activity that caused permanent glow
            }

            // Smooth the signal activity with faster attack, slower release
            if (newActivity > signalActivity)
                signalActivity = signalActivity * 0.3f + newActivity * 0.7f; // Fast attack
            else
                signalActivity = signalActivity * signalDecay + newActivity * (1.0f - signalDecay); // Slow release

            if (signalActivity > 0.001f)
                repaint();
        }
        else
        {
            signalActivity *= signalDecay;
            if (signalActivity > 0.001f)
                repaint();
        }
    }

    /** Trigger MIDI activity animation (called from external when MIDI is detected) */
public:
    void triggerMidiActivity()
    {
        midiActivityCounter = 30; // Show activity for about 1 second at 30fps
        repaint();
    }

    /** Get the port type of this connector */
    PortType getPortType() const noexcept { return portType; }

    /** Get connection info for plugin insertion */
    uint32 getSourceNodeId() const noexcept { return sourceFilterID; }
    uint32 getDestNodeId() const noexcept { return destFilterID; }
    int getSourceChannel() const noexcept { return sourceFilterChannel; }
    int getDestChannel() const noexcept { return destFilterChannel; }

    //=========================================================================
    // DragAndDropTarget implementation for plugin insertion into wire

    bool isInterestedInDragSource (const SourceDetails& details) override
    {
        if (! details.description.isArray())
            return false;

        if (auto* a = details.description.getArray())
        {
            const var type (a->getFirst());
            return type == var ("plugin");
        }

        return false;
    }

    void itemDragEnter (const SourceDetails&) override
    {
        dragHover = true;
        repaint();
    }

    void itemDragExit (const SourceDetails&) override
    {
        dragHover = false;
        repaint();
    }

    void itemDropped (const SourceDetails& details) override
    {
        dragHover = false;
        repaint();

        // Notify parent GraphEditorComponent to handle the insertion
        if (auto* editor = getGraphPanel())
        {
            editor->insertPluginIntoConnection (details, sourceFilterID, sourceFilterChannel,
                                                destFilterID, destFilterChannel, portType);
        }
    }

    bool shouldDrawDragImageWhenOver() override { return true; }

private:
    bool dragHover { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ConnectorComponent)
};

//=============================================================================
/** Ghost connector for showing auto-connect suggestions */
class GhostConnectorComponent : public Component
{
public:
    GhostConnectorComponent (const Node& g)
        : graph (g)
    {
        setInterceptsMouseClicks (false, false);
        setAlwaysOnTop (true);
    }

    ~GhostConnectorComponent() = default;

    void setGraph (const Node& g) { graph = g; }

    /** Set the source and destination for this ghost connection */
    void setConnection (uint32 srcNode, int srcPort, uint32 dstNode, int dstPort, PortType type)
    {
        sourceNodeID = srcNode;
        sourcePortIndex = srcPort;
        destNodeID = dstNode;
        destPortIndex = dstPort;
        portType = type;
        updatePath();
    }

    void updatePath()
    {
        float x1 = 0, y1 = 0, x2 = 0, y2 = 0;
        if (getPoints (x1, y1, x2, y2))
        {
            const Rectangle<int> newBounds ((int) jmin (x1, x2) - 4,
                                            (int) jmin (y1, y2) - 4,
                                            (int) fabsf (x1 - x2) + 8,
                                            (int) fabsf (y1 - y2) + 8);
            setBounds (newBounds);
        }
    }

    bool getPoints (float& x1, float& y1, float& x2, float& y2) const
    {
        bool sres = false, dres = false;

        if (GraphEditorComponent* const hostPanel = findParentComponentOfClass<GraphEditorComponent>())
        {
            if (auto* srcBlock = hostPanel->getComponentForFilter (sourceNodeID))
                sres = srcBlock->getPortPos (sourcePortIndex, false, x1, y1);

            if (auto* dstBlock = hostPanel->getComponentForFilter (destNodeID))
                dres = dstBlock->getPortPos (destPortIndex, true, x2, y2);
        }

        return sres && dres;
    }

    void paint (Graphics& g) override
    {
        float x1, y1, x2, y2;
        if (! getPoints (x1, y1, x2, y2))
            return;

        x1 -= getX();
        y1 -= getY();
        x2 -= getX();
        y2 -= getY();

        // Get the port type color with reduced opacity for ghost effect
        auto c = getColorForPortType (portType).withAlpha (0.4f);

        Path linePath;
        linePath.startNewSubPath (x1, y1);

        const bool vertical = findParentComponentOfClass<GraphEditorComponent>() != nullptr && findParentComponentOfClass<GraphEditorComponent>()->isLayoutVertical();

        if (vertical)
            linePath.cubicTo (x1, y1 + (y2 - y1) * 0.33f, x2, y1 + (y2 - y1) * 0.66f, x2, y2);
        else
            linePath.cubicTo (x1 + (x2 - x1) * 0.33f, y1, x1 + (x2 - x1) * 0.66f, y2, x2, y2);

        // Draw dashed ghost line
        PathStrokeType stroke (2.0f);
        float dashes[] = { 6.0f, 4.0f };
        stroke.createDashedStroke (linePath, linePath, dashes, 2);

        g.setColour (c);
        g.strokePath (linePath, PathStrokeType (2.0f));
    }

    uint32 getSourceNodeID() const noexcept { return sourceNodeID; }
    int getSourcePortIndex() const noexcept { return sourcePortIndex; }
    uint32 getDestNodeID() const noexcept { return destNodeID; }
    int getDestPortIndex() const noexcept { return destPortIndex; }

private:
    Node graph;
    uint32 sourceNodeID { 0 };
    int sourcePortIndex { 0 };
    uint32 destNodeID { 0 };
    int destPortIndex { 0 };
    PortType portType { PortType::Audio };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GhostConnectorComponent)
};

//=============================================================================
void GraphEditorComponent::SelectedNodes::itemSelected (uint32 nodeId)
{
    for (int i = 0; i < editor.getNumChildComponents(); ++i)
        if (auto* block = dynamic_cast<BlockComponent*> (editor.getChildComponent (i)))
            if (nodeId == block->node.getNodeId())
                block->setSelectedInternal (true);
}

void GraphEditorComponent::SelectedNodes::itemDeselected (uint32 nodeId)
{
    for (int i = 0; i < editor.getNumChildComponents(); ++i)
        if (auto* block = dynamic_cast<BlockComponent*> (editor.getChildComponent (i)))
            if (nodeId == block->node.getNodeId())
                block->setSelectedInternal (false);
}

//=============================================================================
GraphEditorComponent::GraphEditorComponent()
    : ViewHelperMixin (this),
      selectedNodes (*this)
{
    EL_LOG ("GFX", "GraphEditorComponent ctor"
                   << " this=" << juce::String::toHexString ((juce::pointer_sized_int) this));
    setOpaque (true);
    data.addListener (this);
    setSize (640, 360);
    startTimerHz (30);
}

GraphEditorComponent::~GraphEditorComponent()
{
    EL_LOG ("GFX", "GraphEditorComponent dtor begin"
                   << " this=" << juce::String::toHexString ((juce::pointer_sized_int) this)
                   << " children=" << getNumChildComponents()
                   << " commentBoxes=" << commentBoxes.size()
                   << " ghostConnectors=" << ghostConnectors.size());

    stopTimer();
    if (graph.isValid())
        graph.setProperty (tags::vertical, verticalLayout);
    data.removeListener (this);
    graph = Node();
    data = ValueTree();

    // `lasso` is a member Component held by value. If it is still in our
    // child list (e.g. destructor fires mid-drag) deleteAllChildren() would
    // call `delete` on a non-heap pointer and corrupt the allocator. Detach
    // it explicitly first.
    removeChildComponent (&lasso);

    // unique_ptrs and OwnedArrays each own Components that are *also* added
    // to our child list via addAndMakeVisible(). Releasing them here makes
    // ~Component self-detach from the parent, so the subsequent
    // deleteAllChildren() does not double-free them (which aborts via
    // malloc_report -> SIGABRT during plugin editor teardown).
    draggingConnector = nullptr;
    quickAdd = nullptr;
    commentBoxes.clear();
    ghostConnectors.clear();

    deleteAllChildren();

    factory.reset();
    EL_LOG ("GFX", "GraphEditorComponent dtor done");
}

void GraphEditorComponent::timerCallback()
{
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (auto* connector = dynamic_cast<ConnectorComponent*> (getChildComponent (i)))
            connector->updateSignalActivity();
    }
}

void GraphEditorComponent::setNode (const Node& n)
{
    bool isGraph = n.isGraph();
    bool isValid = n.isValid();
    const auto ng = isValid && isGraph ? n : Node (types::Graph);

    if (ng == graph)
    {
        // properties might still need updating.
        return;
    }

    EL_LOG ("GFX", "setNode"
                   << " nodeId=" << (int) n.getNodeId()
                   << " isGraph=" << (int) isGraph
                   << " isValid=" << (int) isValid
                   << " children=" << getNumChildComponents()
                   << " commentBoxes=" << commentBoxes.size());

    graph = ng;
    data.removeListener (this);
    data = graph.data();

    verticalLayout = graph.getProperty (tags::vertical, false); // Default to horizontal

    if (draggingConnector)
        removeChildComponent (draggingConnector.get());
    removeChildComponent (&lasso);

    // Clear OwnedArrays and unique-ptrs BEFORE deleteAllChildren(): each
    // owns Components that were also addAndMakeVisible'd as our children.
    // Clearing them first lets ~Component self-detach, so deleteAllChildren()
    // does not double-free the same pointers (which aborts via malloc_report
    // and brings down the host).
    quickAdd = nullptr;
    commentBoxes.clear();
    ghostConnectors.clear();
    deleteAllChildren();

    // Load comment boxes before other components so they appear behind
    loadCommentBoxes();

    updateComponents();
    ensureSize();
    if (draggingConnector)
        addAndMakeVisible (draggingConnector.get());

    data.addListener (this);
}

void GraphEditorComponent::setVerticalLayout (const bool isVertical)
{
    if (verticalLayout == isVertical)
        return;
    EL_LOG ("GFX", "setVerticalLayout isVertical=" << (int) isVertical);
    verticalLayout = isVertical;

    if (graph.isValid() && graph.isGraph())
        graph.setProperty (tags::vertical, verticalLayout);

    draggingConnector = nullptr;
    removeChildComponent (&lasso);

    // Same double-free guard as setNode(): clear owning containers and
    // unique-ptrs before deleteAllChildren() so we do not free the same
    // Component twice when the layout toggles.
    quickAdd = nullptr;
    commentBoxes.clear();
    ghostConnectors.clear();
    deleteAllChildren();

    // Re-load comment boxes for the current graph (they live in the graph
    // ValueTree, so a layout flip should not lose them).
    loadCommentBoxes();
    updateComponents();
}

void GraphEditorComponent::paint (Graphics& g)
{
    g.fillAll (findColour (Style::contentBackgroundColorId));
}

void GraphEditorComponent::paintOverChildren (Graphics& g)
{
    // Draw snap guides during drag operations
    if (! currentSnapGuides.isEmpty())
    {
        g.setColour (Colours::cyan.withAlpha (0.6f));

        for (const auto& guide : currentSnapGuides)
        {
            if (guide.horizontal)
            {
                // Horizontal line
                g.drawLine (static_cast<float> (guide.start),
                            static_cast<float> (guide.position),
                            static_cast<float> (guide.end),
                            static_cast<float> (guide.position),
                            1.0f);
            }
            else
            {
                // Vertical line
                g.drawLine (static_cast<float> (guide.position),
                            static_cast<float> (guide.start),
                            static_cast<float> (guide.position),
                            static_cast<float> (guide.end),
                            1.0f);
            }
        }
    }
}

void GraphEditorComponent::mouseDown (const MouseEvent& e)
{
    if (! isEnabled())
        return;

    lastDropX = (float) e.getMouseDownX();
    lastDropY = (float) e.getMouseDownY();

    // Only clear selection on left-click on empty background
    // Don't clear on right-click (popup menu) so alignment functions work
    if (! e.mods.isPopupMenu() && selectedNodes.getNumSelected() > 0)
    {
        selectedNodes.deselectAll();
        updateSelection();
    }

    if (e.mods.isPopupMenu())
    {
        // Quick-add popup: right-click shows inline search
        // Hold Shift+right-click for the full context menu
        if (! e.mods.isShiftDown())
        {
            if (! quickAdd)
            {
                if (auto* ctx = ViewHelpers::getGlobals (this))
                {
                    quickAdd = std::make_unique<QuickAddComponent> (ctx->plugins());
                    addAndMakeVisible (*quickAdd);
                }
            }

            if (quickAdd)
            {
                quickAdd->showAt (e.getPosition(), graph);
                return;
            }
        }

        PluginsPopupMenu menu (this);
        if (graph.isGraph())
        {
#if 1
            menu.addSectionHeader ("Board I/O");
            menu.addItem (1, "Audio Inputs", true, graph.hasAudioInputNode());
            menu.addItem (2, "Audio Outputs", true, graph.hasAudioOutputNode());
            menu.addItem (3, "MIDI Input", true, graph.hasMidiInputNode());
            menu.addItem (4, "MIDI Output", true, graph.hasMidiOutputNode());
            menu.addSeparator();
#endif
            PopupMenu submenu;
            addMidiDevicesToMenu (submenu, true, 80000);
            menu.addSubMenu ("MIDI Input Device", submenu);
            submenu.clear();
            addMidiDevicesToMenu (submenu, false, 90000);
            menu.addSubMenu ("MIDI Output Device", submenu);
        }

        menu.addSeparator();
        menu.addItem (5, isLayoutVertical() ? "Switch to Horizontal Layout" : "Switch to Vertical Layout");
        menu.addItem (7, "Gather nodes...");
        menu.addItem (8, "Add Comment Box");

        // Alignment submenu
        PopupMenu alignMenu;
        alignMenu.addItem (20, "Align Left");
        alignMenu.addItem (21, "Align Right");
        alignMenu.addItem (22, "Align Top");
        alignMenu.addItem (23, "Align Bottom");
        alignMenu.addSeparator();
        alignMenu.addItem (24, "Center Horizontally");
        alignMenu.addItem (25, "Center Vertically");
        alignMenu.addSeparator();
        alignMenu.addItem (26, "Distribute Horizontally");
        alignMenu.addItem (27, "Distribute Vertically");
        alignMenu.addSeparator();
        alignMenu.addItem (28, snapToGrid ? "Disable Snap to Grid" : "Enable Snap to Grid", true, snapToGrid);
        menu.addSubMenu ("Align Nodes", alignMenu);

        // Molecule submenu
        PopupMenu moleculeMenu;
        bool hasSelection = selectedNodes.getNumSelected() > 0;
        moleculeMenu.addItem (30, "Save Selection as Molecule...", hasSelection);
        moleculeMenu.addSeparator();

        // Add existing molecules
        auto molecules = moleculeLibrary.getMolecules();
        if (molecules.isEmpty())
        {
            moleculeMenu.addItem (0, "(No saved molecules)", false);
        }
        else
        {
            for (int i = 0; i < molecules.size(); ++i)
            {
                moleculeMenu.addItem (1000 + i, "Insert: " + molecules[i].getName());
            }
        }
        moleculeMenu.addSeparator();
        moleculeMenu.addItem (31, "Open Molecules Folder...");
        menu.addSubMenu ("Molecules", moleculeMenu);

        menu.addSeparator();
        menu.addSectionHeader ("Plugins");
        menu.addPluginItems();
        const int result = menu.show();

        if (menu.isPluginResultCode (result))
        {
            bool verified = false;
            const auto desc = menu.getPluginDescription (result, verified);
            if (desc.fileOrIdentifier.isNotEmpty() && desc.pluginFormatName.isNotEmpty())
                ViewHelpers::postMessageFor (this, new AddPluginMessage (graph, desc, verified));
        }
        else if (result >= 80000 && result < 90000)
        {
            ViewHelpers::postMessageFor (this,
                                         new AddMidiDeviceMessage (getMidiDeviceForMenuResult (result, true), true));
        }
        else if (result >= 90000 && result < 100000)
        {
            ViewHelpers::postMessageFor (this,
                                         new AddMidiDeviceMessage (getMidiDeviceForMenuResult (result, false, 90000), false));
        }
        else if (result >= 1000 && result < 2000)
        {
            // Insert molecule
            int moleculeIndex = result - 1000;
            auto molecules = moleculeLibrary.getMolecules();
            if (moleculeIndex >= 0 && moleculeIndex < molecules.size())
            {
                insertMolecule (molecules[moleculeIndex]);
            }
        }
        else
        {
            PluginDescription desc;
            desc.pluginFormatName = "Internal";
            bool hasRequestedType = false;
            bool failure = false;

            switch (result)
            {
                case 1:
                    desc.fileOrIdentifier = "audio.input";
                    hasRequestedType = graph.hasAudioInputNode();
                    break;
                case 2:
                    desc.fileOrIdentifier = "audio.output";
                    hasRequestedType = graph.hasAudioOutputNode();
                    break;
                case 3:
                    desc.fileOrIdentifier = "midi.input";
                    hasRequestedType = graph.hasMidiInputNode();
                    break;
                case 4:
                    desc.fileOrIdentifier = "midi.output";
                    hasRequestedType = graph.hasMidiOutputNode();
                    break;
                case 5:
                    setVerticalLayout (! isLayoutVertical());
                    return;
                    break;

                case 7: {
                    int width = getWidth();
                    int height = getHeight();
                    int numChanges = 0;
                    int numEditorChanges = 0;
                    for (int i = 0; i < getNumChildComponents(); ++i)
                    {
                        auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i));
                        if (nullptr == block)
                            continue;

                        auto r = block->getBounds();
                        // auto x = r.getX(), y = r.getY();
                        // if (! isLayoutVertical())
                        bool changed = false;
                        if (r.getX() < 0)
                        {
                            changed = true;
                            r = r.withX (0);
                        }
                        else if (r.getRight() > width)
                        {
                            numEditorChanges++;
                            width = r.getRight();
                        }

                        if (r.getY() < 0)
                        {
                            changed = true;
                            r = r.withY (0);
                        }
                        else if (r.getBottom() > height)
                        {
                            numEditorChanges++;
                            height = r.getBottom();
                        }

                        if (changed)
                        {
                            block->moveBlockTo (r.getX(), r.getY());
                            ++numChanges;
                        }
                    }

                    if (numChanges > 0)
                    {
                        updateBlockComponents (true);
                        updateConnectorComponents();
                    }

                    if (numEditorChanges > 0)
                        setSize (width, height);
                    return;
                }
                break;

                case 8: {
                    // Create comment box at click location
                    createCommentBoxAt (static_cast<int> (lastDropX) - 100,
                                        static_cast<int> (lastDropY) - 75,
                                        200, 150);
                    return;
                }
                break;

                // Zoom options (commented don't look right yet)
                // case 50: setZoomScale (0.25); return; break;
                // case 51: setZoomScale (0.50); return; break;
                case 52:
                    setZoomScale (0.75);
                    return;
                    break;
                case 53:
                    setZoomScale (1.00);
                    return;
                    break;
                case 54:
                    setZoomScale (1.25);
                    return;
                    break;
                case 55:
                    setZoomScale (1.50);
                    return;
                    break;
                case 56:
                    setZoomScale (1.75);
                    return;
                    break;
                case 57:
                    setZoomScale (2.00);
                    return;
                    break;

                // Alignment menu items
                case 20: alignSelectedNodesLeft(); return;
                case 21: alignSelectedNodesRight(); return;
                case 22: alignSelectedNodesTop(); return;
                case 23: alignSelectedNodesBottom(); return;
                case 24: alignSelectedNodesCenterHorizontal(); return;
                case 25: alignSelectedNodesCenterVertical(); return;
                case 26: distributeSelectedNodesHorizontally(); return;
                case 27: distributeSelectedNodesVertically(); return;
                case 28: setSnapToGridEnabled (! snapToGrid); return;

                // Molecule menu items
                case 30: saveSelectionAsMolecule(); return;
                case 31: {
                    moleculeLibrary.getMoleculeDirectory().revealToUser();
                    return;
                }

                case 100: {
                    updateBlockComponents (true);
                    updateConnectorComponents();
                    return;
                }
                break;

                default:
                    failure = true;
                    break;
            }

            if (failure)
            {
                DBG ("[element] unkown menu result: " << result);
            }
            else if (hasRequestedType)
            {
                const ValueTree requestedNode = graph.getNodesValueTree()
                                                    .getChildWithProperty (tags::identifier, desc.fileOrIdentifier);
                const Node model (requestedNode, false);
                ViewHelpers::postMessageFor (this, new RemoveNodeMessage (model));
            }
            else
            {
                ViewHelpers::postMessageFor (this, new AddPluginMessage (graph, desc));
            }
        }
    }
    else
    {
        addAndMakeVisible (lasso);
        lasso.beginLasso (e, this);
    }
}

void GraphEditorComponent::mouseUp (const MouseEvent& e)
{
    lasso.endLasso();
    removeChildComponent (&lasso);
}

void GraphEditorComponent::mouseDrag (const MouseEvent& e)
{
    lasso.dragLasso (e);
}

void GraphEditorComponent::createNewPlugin (const PluginDescription* desc, int x, int y)
{
    DBG ("[element] GraphEditorComponent::createNewPlugin(...)");
}

BlockComponent* GraphEditorComponent::getComponentForNode (const Node& node) const
{
    return getComponentForFilter (node.getNodeId());
}

BlockComponent* GraphEditorComponent::getComponentForFilter (const uint32 nodeID) const
{
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (BlockComponent* const block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
            if (block->filterID == nodeID)
                return block;
    }

    return nullptr;
}

ConnectorComponent* GraphEditorComponent::getComponentForConnection (const Arc& arc) const
{
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (ConnectorComponent* const c = dynamic_cast<ConnectorComponent*> (getChildComponent (i)))
            if (c->sourceFilterID == arc.sourceNode
                && c->destFilterID == arc.destNode
                && (uint32_t) c->sourceFilterChannel == arc.sourcePort
                && (uint32_t) c->destFilterChannel == arc.destPort)
                return c;
    }

    return nullptr;
}

PortComponent* GraphEditorComponent::findPinAt (const int x, const int y) const
{
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (BlockComponent* block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
        {
            if (PortComponent* pin = dynamic_cast<PortComponent*> (block->getComponentAt (x - block->getX(),
                                                                                          y - block->getY())))
                return pin;
        }
    }

    return nullptr;
}

void GraphEditorComponent::resized()
{
    updateBlockComponents (false);
    updateConnectorComponents();
}

void GraphEditorComponent::changeListenerCallback (ChangeBroadcaster*)
{
    updateComponents();
}

void GraphEditorComponent::updateConnectorComponents (bool async)
{
    struct UpdateConnectors : public juce::MessageManager::MessageBase
    {
        UpdateConnectors (GraphEditorComponent* g) : editor (g) {}
        void messageCallback() override
        {
            if (auto* g = editor.getComponent())
                g->updateConnectorComponents (false);
        };
        Component::SafePointer<GraphEditorComponent> editor;
    };

    if (async)
    {
        (new UpdateConnectors (this))->post();
        return;
    }

    const ValueTree arcs = graph.getArcsValueTree();
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        ConnectorComponent* const cc = dynamic_cast<ConnectorComponent*> (getChildComponent (i));
        if (cc != nullptr && cc != draggingConnector.get())
        {
            if (! Node::connectionExists (arcs, cc->sourceFilterID, (uint32) cc->sourceFilterChannel, cc->destFilterID, (uint32) cc->destFilterChannel, true))
            {
                delete cc;
            }
            else
            {
                // update cable or remove if can't get coordinates
                float x1, y1, x2, y2;
                if (cc->getPoints (x1, y1, x2, y2))
                    cc->update();
                else
                    delete cc;
            }
        }
    }
}

void GraphEditorComponent::updateBlockComponents (const bool doPosition)
{
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
        {
            block->update (doPosition);
        }
    }
}

void GraphEditorComponent::stabilizeNodes()
{
    for (int i = getNumChildComponents(); --i >= 0;)
        if (auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
        {
            block->update (false);
            block->repaint();
        }
}

void GraphEditorComponent::updateComponents (const bool doNodePositions)
{
    for (int i = graph.getNumConnections(); --i >= 0;)
    {
        const ValueTree c = graph.getConnectionValueTree (i);
        const Arc arc (Node::arcFromValueTree (c));
        ConnectorComponent* connector = getComponentForConnection (arc);

        if (connector == nullptr)
        {
            connector = new ConnectorComponent (graph);
            addAndMakeVisible (connector, i);
        }

        connector->setGraph (this->graph);
        connector->setInput (arc.sourceNode, arc.sourcePort);
        connector->setOutput (arc.destNode, arc.destPort);
    }

    for (int i = graph.getNumNodes(); --i >= 0;)
    {
        const Node node (graph.getNode (i));
        BlockComponent* comp = getComponentForFilter (node.getNodeId());
        if (comp == nullptr)
        {
            comp = createBlock (node);
            jassert (comp != nullptr);
            addAndMakeVisible (comp, i + 10000);
        }
    }

    updateBlockComponents (doNodePositions);
    updateConnectorComponents();
}

Rectangle<int> GraphEditorComponent::getRequiredSpace() const
{
    Rectangle<int> r;
    r.setX (0);
    r.setY (0);
    for (int i = getNumChildComponents(); --i >= 0;)
    {
        if (auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
        {
            if (block->getRight() > r.getWidth())
                r.setWidth (block->getRight());
            if (block->getBottom() > r.getHeight())
                r.setHeight (block->getBottom());
        }
    }
    return r;
}

void GraphEditorComponent::beginConnectorDrag (const uint32 sourceNode, const int sourceFilterChannel, const uint32 destNode, const int destFilterChannel, const MouseEvent& e)
{
    draggingConnector.reset (dynamic_cast<ConnectorComponent*> (e.originalComponent));
    if (draggingConnector == nullptr)
        draggingConnector.reset (new ConnectorComponent (graph));

    draggingConnector->setGraph (this->graph);
    draggingConnector->setInput (sourceNode, sourceFilterChannel);
    draggingConnector->setOutput (destNode, destFilterChannel);
    draggingConnector->setAlwaysOnTop (true);
    addAndMakeVisible (draggingConnector.get());
    draggingConnector->toFront (false);

    dragConnector (e);
}

void GraphEditorComponent::dragConnector (const MouseEvent& e)
{
    const MouseEvent e2 (e.getEventRelativeTo (this));

    if (draggingConnector != nullptr)
    {
        draggingConnector->setTooltip (String());

        int x = e2.x;
        int y = e2.y;

        if (PortComponent* const pin = findPinAt (x, y))
        {
            uint32 srcFilter = draggingConnector->sourceFilterID;
            int srcChannel = draggingConnector->sourceFilterChannel;
            uint32 dstFilter = draggingConnector->destFilterID;
            int dstChannel = draggingConnector->destFilterChannel;

            if (srcFilter == 0 && ! pin->isInput())
            {
                srcFilter = pin->getNodeId();
                srcChannel = pin->getPortIndex();
            }
            else if (dstFilter == 0 && pin->isInput())
            {
                dstFilter = pin->getNodeId();
                dstChannel = pin->getPortIndex();
            }

            if (graph.canConnect (srcFilter, srcChannel, dstFilter, dstChannel))
            {
                x = pin->getParentComponent()->getX() + pin->getX() + pin->getWidth() / 2;
                y = pin->getParentComponent()->getY() + pin->getY() + pin->getHeight() / 2;

                draggingConnector->setTooltip (pin->getTooltip());
            }
        }

        if (draggingConnector->sourceFilterID == 0)
            draggingConnector->dragStart (x, y);
        else
            draggingConnector->dragEnd (x, y);
    }
}

Component* GraphEditorComponent::createContainerForNode (ProcessorPtr node, bool useGenericEditor)
{
    if (AudioProcessorEditor* ed = createEditorForNode (node, useGenericEditor))
        if (Component* comp = wrapAudioProcessorEditor (ed, node))
            return comp;
    return nullptr;
}

Component* GraphEditorComponent::wrapAudioProcessorEditor (AudioProcessorEditor* ed, ProcessorPtr) { return ed; }

AudioProcessorEditor* GraphEditorComponent::createEditorForNode (ProcessorPtr node, bool useGenericEditor)
{
    std::unique_ptr<AudioProcessorEditor> ui = nullptr;

    if (! useGenericEditor)
    {
        if (auto* proc = node->getAudioProcessor())
            ui.reset (proc->createEditorIfNeeded());
        if (ui == nullptr)
            useGenericEditor = true;
    }

    if (useGenericEditor)
        ui.reset (new GenericAudioProcessorEditor (*node->getAudioProcessor()));

    return (nullptr != ui) ? ui.release() : nullptr;
}

void GraphEditorComponent::endDraggingConnector (const MouseEvent& e)
{
    if (draggingConnector == nullptr)
        return;

    draggingConnector->setTooltip (String());

    const MouseEvent e2 (e.getEventRelativeTo (this));

    uint32 srcFilter = draggingConnector->sourceFilterID;
    int srcChannel = draggingConnector->sourceFilterChannel;
    uint32 dstFilter = draggingConnector->destFilterID;
    int dstChannel = draggingConnector->destFilterChannel;

    draggingConnector = nullptr;

    if (PortComponent* const pin = findPinAt (e2.x, e2.y))
    {
        if (srcFilter == 0)
        {
            if (pin->isInput())
                return;

            srcFilter = pin->getNodeId();
            srcChannel = pin->getPortIndex();
        }
        else
        {
            if (! pin->isInput())
                return;

            dstFilter = pin->getNodeId();
            dstChannel = pin->getPortIndex();
        }

        connectPorts (graph, srcFilter, (uint32) srcChannel, dstFilter, (uint32) dstChannel);
    }
}

//=============================================================================
bool GraphEditorComponent::isInterestedInDragSource (const SourceDetails& details)
{
    if (details.description.toString() == "ccNavConcertinaPanel")
        return true;

    if (! details.description.isArray())
        return false;

    if (auto* a = details.description.getArray())
    {
        const var type (a->getFirst());
        return type == var ("plugin");
    }

    return false;
}

void GraphEditorComponent::itemDropped (const SourceDetails& details)
{
    lastDropX = (float) details.localPosition.x;
    lastDropY = (float) details.localPosition.y;

    if (const auto* a = details.description.getArray())
    {
        auto& plugs (ViewHelpers::getGlobals (this)->plugins());

        if (const auto t = plugs.getKnownPlugins().getTypeForIdentifierString (a->getUnchecked (1).toString()))
        {
            std::unique_ptr<AddPluginMessage> message (new AddPluginMessage (graph, *t));
            auto& builder (message->builder);

            if (ModifierKeys::getCurrentModifiersRealtime().isAltDown())
            {
                const auto audioInputNode = graph.getIONode (PortType::Audio, true);
                const auto midiInputNode = graph.getIONode (PortType::Midi, true);
                builder.addChannel (audioInputNode, PortType::Audio, 0, 0, false);
                builder.addChannel (audioInputNode, PortType::Audio, 1, 1, false);
                builder.addChannel (midiInputNode, PortType::Midi, 0, 0, false);
            }

            if (ModifierKeys::getCurrentModifiersRealtime().isCommandDown())
            {
                const auto audioOutputNode = graph.getIONode (PortType::Audio, false);
                const auto midiOutNode = graph.getIONode (PortType::Midi, false);
                builder.addChannel (audioOutputNode, PortType::Audio, 0, 0, true);
                builder.addChannel (audioOutputNode, PortType::Audio, 1, 1, true);
                builder.addChannel (midiOutNode, PortType::Midi, 0, 0, true);
            }

            postMessage (message.release());
        }
    }
}

void GraphEditorComponent::insertPluginIntoConnection (const SourceDetails& details,
                                                       uint32 srcNodeId, int srcPort,
                                                       uint32 dstNodeId, int dstPort,
                                                       PortType connectionType)
{
    if (! graph.isValid())
        return;

    if (const auto* a = details.description.getArray())
    {
        auto& plugs (ViewHelpers::getGlobals (this)->plugins());

        if (const auto t = plugs.getKnownPlugins().getTypeForIdentifierString (a->getUnchecked (1).toString()))
        {
            // Get the source and destination nodes
            Node srcNode = graph.getNodeById (srcNodeId);
            Node dstNode = graph.getNodeById (dstNodeId);

            if (! srcNode.isValid() || ! dstNode.isValid())
                return;

            // First, remove the existing connection
            // Use port-based removal (srcPort and dstPort are channel indices)
            postMessage (new RemoveConnectionMessage (srcNodeId, srcPort, dstNodeId, dstPort, graph));

            // Create a message to add the plugin with connection routing
            std::unique_ptr<AddPluginMessage> message (new AddPluginMessage (graph, *t));
            auto& builder (message->builder);

            // Add connections based on port type
            if (connectionType.isAudio())
            {
                // For audio: connect stereo channels
                // Source -> New Plugin Input
                builder.addChannel (srcNode, PortType::Audio, srcPort, 0, false);
                // Second channel if available
                Port srcNextPort = srcNode.getPort (srcPort + 1);
                if (srcNextPort.data().isValid() && srcNextPort.getType().isAudio() && ! srcNextPort.isInput())
                {
                    builder.addChannel (srcNode, PortType::Audio, srcPort + 1, 1, false);
                }

                // New Plugin Output -> Destination
                builder.addChannel (dstNode, PortType::Audio, dstPort, 0, true);
                // Second channel if available
                Port dstNextPort = dstNode.getPort (dstPort + 1);
                if (dstNextPort.data().isValid() && dstNextPort.getType().isAudio() && dstNextPort.isInput())
                {
                    builder.addChannel (dstNode, PortType::Audio, dstPort + 1, 1, true);
                }
            }
            else if (connectionType.isMidi())
            {
                // For MIDI: single connection each way
                // Source -> New Plugin Input
                builder.addChannel (srcNode, PortType::Midi, srcPort, 0, false);
                // New Plugin Output -> Destination
                builder.addChannel (dstNode, PortType::Midi, dstPort, 0, true);
            }

            // Set the position of the new node to be between source and destination
            auto* srcBlock = getComponentForFilter (srcNodeId);
            auto* dstBlock = getComponentForFilter (dstNodeId);
            if (srcBlock != nullptr && dstBlock != nullptr)
            {
                int midX = (srcBlock->getX() + srcBlock->getWidth() + dstBlock->getX()) / 2;
                int midY = (srcBlock->getY() + dstBlock->getY()) / 2;
                lastDropX = static_cast<float> (midX);
                lastDropY = static_cast<float> (midY);
            }

            postMessage (message.release());
        }
    }
}

bool GraphEditorComponent::isInterestedInFileDrag (const StringArray& files)
{
    for (const auto& path : files)
        if (File (path).hasFileExtension ("elg;elpreset;eln;molecule"))
            return true;
    return false;
}

void GraphEditorComponent::filesDropped (const StringArray& files, int x, int y)
{
    lastDropX = x;
    lastDropY = y;

    if (onFilesDropped && onFilesDropped (files, x, y))
        return;

    for (const auto& path : files)
    {
        const auto file = File (path);

        // Handle molecule files
        if (file.hasFileExtension ("molecule"))
        {
            auto mol = Molecule::loadFromFile (file);
            if (mol.isValid())
            {
                // Store drop position for later use
                lastDropX = static_cast<float> (x) / static_cast<float> (jmax (1, getWidth()));
                lastDropY = static_cast<float> (y) / static_cast<float> (jmax (1, getHeight()));
                insertMolecule (mol);
            }
            continue;
        }

        const Node node (Node::parse (file));
        bool wasHandled = false;

        if (! wasHandled && node.isValid())
        {
            std::unique_ptr<AddNodeMessage> message (new AddNodeMessage (node, graph, file));

            auto& builder (message->builder);
            if (ModifierKeys::getCurrentModifiersRealtime().isAltDown())
            {
                const auto audioInputNode = graph.getIONode (PortType::Audio, true);
                const auto midiInputNode = graph.getIONode (PortType::Midi, true);
                builder.addChannel (audioInputNode, PortType::Audio, 0, 0, false);
                builder.addChannel (audioInputNode, PortType::Audio, 1, 1, false);
                builder.addChannel (midiInputNode, PortType::Midi, 0, 0, false);
            }

            if (ModifierKeys::getCurrentModifiersRealtime().isCommandDown())
            {
                const auto audioOutputNode = graph.getIONode (PortType::Audio, false);
                const auto midiOutNode = graph.getIONode (PortType::Midi, false);
                builder.addChannel (audioOutputNode, PortType::Audio, 0, 0, true);
                builder.addChannel (audioOutputNode, PortType::Audio, 1, 1, true);
                builder.addChannel (midiOutNode, PortType::Midi, 0, 0, true);
            }
            postMessage (message.release());
        }
    }
}

//=============================================================================
void GraphEditorComponent::valueTreeChildAdded (ValueTree& parent, ValueTree& child)
{
    if (child.hasType (types::Node))
    {
        child.setProperty (tags::x, verticalLayout ? lastDropX : lastDropY, 0);
        child.setProperty (tags::y, verticalLayout ? lastDropY : lastDropX, 0);
        auto* comp = createBlock (Node (child, false));
        addAndMakeVisible (comp, 20000);
        comp->update();
    }
    else if (child.hasType (types::Arc) || child.hasType (tags::nodes) || child.hasType (tags::arcs))
    {
        updateComponents();
    }
    else if (child.hasType (tags::ports))
    {
        const Node node (parent, false);
        for (int i = 0; i < getNumChildComponents(); ++i)
            if (auto* const filter = dynamic_cast<BlockComponent*> (getChildComponent (i)))
                filter->update (false, false);
        updateConnectorComponents();
    }
}

void GraphEditorComponent::valueTreeChildRemoved (ValueTree& parent,
                                                  ValueTree& child,
                                                  int index)
{
    juce::ignoreUnused (parent, child, index);
}

void GraphEditorComponent::findLassoItemsInArea (Array<uint32>& itemsFound,
                                                 const Rectangle<int>& area)
{
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        if (auto* block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
            if (area.intersects (block->getBounds()))
            {
                itemsFound.add (block->node.getNodeId());
                block->repaint();
            }
    }
}

void GraphEditorComponent::selectNode (const Node& nodeToSelect)
{
    if (ignoreNodeSelected)
        return;

    for (int i = 0; i < graph.getNumNodes(); ++i)
    {
        auto node = graph.getNode (i);
        if (node == nodeToSelect)
        {
            selectedNodes.selectOnly (nodeToSelect.getNodeId());
            updateSelection();
            if (auto* cc = ViewHelpers::findContentComponent (this))
            {
                auto* gui = cc->services().find<GuiService>();
                if (gui->getSelectedNode() != nodeToSelect)
                    gui->selectNode (nodeToSelect);
            }

            break;
        }
    }
}

void GraphEditorComponent::selectAllNodes()
{
    if (ignoreNodeSelected)
        return;

    Node lastSelected;
    for (int i = 0; i < graph.getNumNodes(); ++i)
    {
        auto node = lastSelected = graph.getNode (i);
        selectedNodes.addToSelection (node.getNodeId());
    }

    updateSelection();
    if (auto* cc = ViewHelpers::findContentComponent (this))
    {
        auto* gui = cc->services().find<GuiService>();
        if (gui->getSelectedNode() != lastSelected)
            gui->selectNode (lastSelected);
    }
}

void GraphEditorComponent::deleteSelectedNodes()
{
    NodeArray toRemove;
    for (const auto& nodeId : selectedNodes)
    {
        const auto node = graph.getNodeById (nodeId);
        toRemove.add (node);
    }

    for (const auto& sl : toRemove)
        if (auto x = getComponentForNode (sl))
            if (x->displayMode == BlockComponent::Embed)
                x->clearEmbedded();

    ViewHelpers::postMessageFor (this, new RemoveNodeMessage (toRemove));
    selectedNodes.deselectAll();
}

void GraphEditorComponent::duplicateSelectedNodes()
{
    if (selectedNodes.getNumSelected() == 0)
        return;

    // Duplicate each selected node
    for (const auto& nodeId : selectedNodes)
    {
        const Node node = graph.getNodeById (nodeId);
        if (node.isValid() && ! node.isIONode())
        {
            ViewHelpers::postMessageFor (this, new DuplicateNodeMessage (node));
        }
    }
}

void GraphEditorComponent::renameSelectedNodes()
{
    if (selectedNodes.getNumSelected() == 0)
        return;

    // Get the first selected node's name as default
    String defaultName;
    Node firstNode;
    for (const auto& nodeId : selectedNodes)
    {
        firstNode = graph.getNodeById (nodeId);
        if (firstNode.isValid())
        {
            defaultName = firstNode.getName();
            break;
        }
    }

    if (! firstNode.isValid())
        return;

    // Show rename dialog
    auto* aw = new AlertWindow ("Rename Block",
                                 selectedNodes.getNumSelected() > 1
                                     ? "Enter a new name for the selected blocks:"
                                     : "Enter a new name:",
                                 MessageBoxIconType::QuestionIcon);
    aw->addTextEditor ("name", defaultName, "Name:");
    aw->addButton ("Cancel", 0, KeyPress (KeyPress::escapeKey));
    aw->addButton ("Rename", 1, KeyPress (KeyPress::returnKey));

    juce::Component::SafePointer<GraphEditorComponent> safeThis (this);
    aw->enterModalState (true, ModalCallbackFunction::create ([safeThis] (int result)
    {
        if (safeThis == nullptr)
            return;

        if (result != 1)
            return;

        auto* aw = dynamic_cast<AlertWindow*> (Component::getCurrentlyModalComponent());
        if (aw == nullptr)
            return;

        String newName = aw->getTextEditorContents ("name").trim();
        if (newName.isEmpty())
            return;

        // Apply the new name to all selected nodes
        int index = 0;
        for (const auto& nodeId : safeThis->selectedNodes)
        {
            Node node = safeThis->graph.getNodeById (nodeId);
            if (node.isValid())
            {
                // If multiple nodes, append index to keep names unique
                if (safeThis->selectedNodes.getNumSelected() > 1)
                    node.setProperty (tags::name, newName + " " + String (++index));
                else
                    node.setProperty (tags::name, newName);
            }
        }

        safeThis->updateBlockComponents (false);
    }), true);
}

void GraphEditorComponent::setSelectedNodesCompact (bool selected)
{
#if 0
    int nchanged = 0;
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        auto* block = dynamic_cast<BlockComponent*> (getChildComponent (i));
        if (nullptr == block)
            continue;
        if (! selectedNodes.getItemArray().contains (block->node.getNodeId()))
            continue;
        block->compact.removeListener (block);
        block->compact.setValue (selected);
        block->compact.addListener (block);
        block->update (false, false);
        ++nchanged;
    }

    if (nchanged > 0)
        updateConnectorComponents();
#endif
}

void GraphEditorComponent::setZoomScale (float scale)
{
    if (scale == zoomScale)
        return;

    zoomScale = scale;
    updateComponents();
    if (onZoomChanged)
        onZoomChanged();
}

void GraphEditorComponent::updateSelection()
{
    for (int i = getNumChildComponents(); --i >= 0;)
        if (auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
            block->repaint();
}

void GraphEditorComponent::ensureSize()
{
    int width = getWidth();
    int height = getHeight();
    int numChanges = 0;
    int numEditorChanges = 0;
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        auto* const block = dynamic_cast<BlockComponent*> (getChildComponent (i));
        if (nullptr == block)
            continue;

        auto r = block->getBounds();
        // auto x = r.getX(), y = r.getY();
        // if (! isLayoutVertical())
        bool changed = false;
        if (r.getX() < 0)
        {
            changed = true;
            r = r.withX (0);
        }
        else if (r.getRight() > width)
        {
            numEditorChanges++;
            width = r.getRight();
        }

        if (r.getY() < 0)
        {
            changed = true;
            r = r.withY (0);
        }
        else if (r.getBottom() > height)
        {
            numEditorChanges++;
            height = r.getBottom();
        }

        if (changed)
        {
            block->moveBlockTo (r.getX(), r.getY());
            ++numChanges;
        }
    }

    if (numChanges > 0)
    {
        updateBlockComponents (true);
        updateConnectorComponents();
    }

    if (numEditorChanges > 0)
        setSize (width, height);
}

BlockComponent* GraphEditorComponent::createBlock (const Node& node)
{
    if (factory == nullptr)
        if (auto* cc = ViewHelpers::findContentComponent (this))
            factory = std::make_unique<DefaultBlockFactory> (cc->context(), *this);

    if (factory == nullptr)
    {
        jassertfalse;
        return nullptr;
    }

    return factory->createBlockComponent (node);
}

BlockComponent* GraphEditorComponent::findBlock (const Node& node) const noexcept
{
    for (int i = 0; i < getNumChildComponents(); ++i)
        if (auto block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
            if (block->node == node)
                return block;
    return nullptr;
}

//=============================================================================
// Auto-connect suggestion methods

void GraphEditorComponent::clearGhostConnectors()
{
    ghostConnectors.clear();
    lastMovedBlock = nullptr;
}

void GraphEditorComponent::updateAutoConnectSuggestions (BlockComponent* block)
{
    if (! block || ! graph.isValid())
    {
        clearGhostConnectors();
        return;
    }

    // Clear existing ghost connectors
    ghostConnectors.clear();
    lastMovedBlock = block;

    const Node movingNode = block->getNode();
    if (! movingNode.isValid())
        return;

    const auto movingBounds = block->getBounds();
    const int proximityThreshold = 150; // Pixels

    // Track which node pairs already have a ghost connection to prevent bi-directional suggestions
    std::set<std::pair<uint32, uint32>> suggestedPairs;

    // Helper to check if adding a connection would create a cycle
    // Uses a simple DFS to detect if destination can reach source
    auto wouldCreateCycle = [this] (uint32 srcNodeId, uint32 dstNodeId) -> bool {
        // Build adjacency list from existing connections
        std::map<uint32, std::set<uint32>> adjacency;
        auto arcs = graph.getArcsValueTree();
        for (int i = 0; i < arcs.getNumChildren(); ++i)
        {
            auto arc = arcs.getChild (i);
            uint32 src = static_cast<uint32> ((int) arc.getProperty ("sourceNode"));
            uint32 dst = static_cast<uint32> ((int) arc.getProperty ("destNode"));
            adjacency[src].insert (dst);
        }

        // Add the proposed connection
        adjacency[srcNodeId].insert (dstNodeId);

        // DFS from destination to see if we can reach source (would be a cycle)
        std::set<uint32> visited;
        std::function<bool (uint32)> canReach = [&] (uint32 current) -> bool {
            if (current == srcNodeId)
                return true;
            if (visited.count (current))
                return false;
            visited.insert (current);
            for (uint32 next : adjacency[current])
            {
                if (canReach (next))
                    return true;
            }
            return false;
        };

        return canReach (dstNodeId);
    };

    // Helper lambda to determine if a connection follows signal flow
    // In horizontal mode: signal flows left to right
    // In vertical mode: signal flows top to bottom
    auto followsSignalFlow = [this] (const Rectangle<int>& srcBounds, const Rectangle<int>& dstBounds) -> bool {
        if (verticalLayout)
            return srcBounds.getCentreY() < dstBounds.getCentreY();
        else
            return srcBounds.getCentreX() < dstBounds.getCentreX();
    };

    // Find all nearby blocks
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        auto* otherBlock = dynamic_cast<BlockComponent*> (getChildComponent (i));
        if (! otherBlock || otherBlock == block)
            continue;

        const auto otherBounds = otherBlock->getBounds();
        const Node otherNode = otherBlock->getNode();
        if (! otherNode.isValid())
            continue;

        // Check if blocks are close enough
        int dx = movingBounds.getCentreX() - otherBounds.getCentreX();
        int dy = movingBounds.getCentreY() - otherBounds.getCentreY();
        int distance = (int) std::sqrt (dx * dx + dy * dy);

        if (distance > proximityThreshold)
            continue;

        // Determine which node should be source (upstream) based on position
        bool movingIsUpstream = followsSignalFlow (movingBounds, otherBounds);

        // Only suggest connections in one direction (following signal flow)
        // This prevents feedback loops
        if (movingIsUpstream)
        {
            // Moving node is upstream - suggest connections from moving to other
            for (int srcPort = 0; srcPort < movingNode.getNumPorts(); ++srcPort)
            {
                Port srcPortObj = movingNode.getPort (srcPort);
                if (! srcPortObj.data().isValid() || srcPortObj.isInput())
                    continue;

                PortType srcType = srcPortObj.getType();

                for (int dstPort = 0; dstPort < otherNode.getNumPorts(); ++dstPort)
                {
                    Port dstPortObj = otherNode.getPort (dstPort);
                    if (! dstPortObj.data().isValid() || dstPortObj.isOutput())
                        continue;

                    PortType dstType = dstPortObj.getType();

                    // Check type compatibility
                    if (! PortType::canConnect (srcType, dstType))
                        continue;

                    // Check if connection already exists
                    if (Node::connectionExists (graph.getArcsValueTree(),
                                                movingNode.getNodeId(), srcPort,
                                                otherNode.getNodeId(), dstPort))
                        continue;

                    // Check if this connection would create a cycle (feedback loop)
                    if (wouldCreateCycle (movingNode.getNodeId(), otherNode.getNodeId()))
                        continue;

                    // Create ghost connector
                    auto* ghost = new GhostConnectorComponent (graph);
                    ghost->setConnection (movingNode.getNodeId(), srcPort,
                                          otherNode.getNodeId(), dstPort, srcType);
                    addAndMakeVisible (ghost);
                    ghost->updatePath();
                    ghostConnectors.add (ghost);
                }
            }
        }
        else
        {
            // Other node is upstream - suggest connections from other to moving
            for (int srcPort = 0; srcPort < otherNode.getNumPorts(); ++srcPort)
            {
                Port srcPortObj = otherNode.getPort (srcPort);
                if (! srcPortObj.data().isValid() || srcPortObj.isInput())
                    continue;

                PortType srcType = srcPortObj.getType();

                for (int dstPort = 0; dstPort < movingNode.getNumPorts(); ++dstPort)
                {
                    Port dstPortObj = movingNode.getPort (dstPort);
                    if (! dstPortObj.data().isValid() || dstPortObj.isOutput())
                        continue;

                    PortType dstType = dstPortObj.getType();

                    // Check type compatibility
                    if (! PortType::canConnect (srcType, dstType))
                        continue;

                    // Check if connection already exists
                    if (Node::connectionExists (graph.getArcsValueTree(),
                                                otherNode.getNodeId(), srcPort,
                                                movingNode.getNodeId(), dstPort))
                        continue;

                    // Check if this connection would create a cycle (feedback loop)
                    if (wouldCreateCycle (otherNode.getNodeId(), movingNode.getNodeId()))
                        continue;

                    // Create ghost connector
                    auto* ghost = new GhostConnectorComponent (graph);
                    ghost->setConnection (otherNode.getNodeId(), srcPort,
                                          movingNode.getNodeId(), dstPort, srcType);
                    addAndMakeVisible (ghost);
                    ghost->updatePath();
                    ghostConnectors.add (ghost);
                }
            }
        }
    }

    ignoreUnused (suggestedPairs);
}

void GraphEditorComponent::applyGhostConnections()
{
    if (ghostConnectors.isEmpty())
        return;

    // Apply all ghost connections
    for (auto* ghost : ghostConnectors)
    {
        connectPorts (graph,
                      ghost->getSourceNodeID(), ghost->getSourcePortIndex(),
                      ghost->getDestNodeID(), ghost->getDestPortIndex());
    }

    // Clear ghost connectors after applying
    clearGhostConnectors();
}

//=============================================================================
// Comment Box Methods

void GraphEditorComponent::createCommentBox()
{
    // Get selected blocks to determine comment box bounds
    Array<Component*> selectedBlocks;
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        if (auto* block = dynamic_cast<BlockComponent*> (getChildComponent (i)))
        {
            if (block->isSelected())
                selectedBlocks.add (block);
        }
    }

    Rectangle<int> bounds;
    if (selectedBlocks.isEmpty())
    {
        // No selection, create at last click location
        bounds = Rectangle<int> (static_cast<int> (lastDropX) - 100,
                                 static_cast<int> (lastDropY) - 75,
                                 200, 150);
    }
    else
    {
        // Create bounds around selected blocks
        bounds = CommentBoxComponent::getBoundsForBlocks (selectedBlocks, 30);
    }

    createCommentBoxAt (bounds.getX(), bounds.getY(), bounds.getWidth(), bounds.getHeight());
}

CommentBoxComponent* GraphEditorComponent::createCommentBoxAt (int x, int y, int width, int height)
{
    // Create data for the comment box
    ValueTree boxData ("CommentBox");
    boxData.setProperty ("title", "Comment", nullptr);
    boxData.setProperty ("color", Colour (0x40808080).toString(), nullptr);
    boxData.setProperty ("x", static_cast<double> (x), nullptr);
    boxData.setProperty ("y", static_cast<double> (y), nullptr);
    boxData.setProperty ("width", static_cast<double> (width), nullptr);
    boxData.setProperty ("height", static_cast<double> (height), nullptr);
    boxData.setProperty ("uuid", Uuid().toString(), nullptr);

    // Create the component
    auto* box = new CommentBoxComponent (boxData);
    box->onDeleteRequested = [this] (CommentBoxComponent* b) {
        deleteCommentBox (b);
    };
    box->onDataChanged = [this] (CommentBoxComponent*) {
        saveCommentBoxes();
    };
    box->onNodesMovedWithBox = [this] (CommentBoxComponent*) {
        updateConnectorComponents();
    };

    // Add to the editor (behind blocks, before connectors)
    addAndMakeVisible (box, 0);
    commentBoxes.add (box);

    // Save to graph data
    saveCommentBoxes();

    return box;
}

void GraphEditorComponent::deleteCommentBox (CommentBoxComponent* box)
{
    if (box == nullptr)
        return;

    commentBoxes.removeObject (box, true);
    saveCommentBoxes();
}

void GraphEditorComponent::deleteSelectedCommentBoxes()
{
    for (int i = commentBoxes.size(); --i >= 0;)
    {
        if (commentBoxes[i]->getSelected())
        {
            commentBoxes.remove (i);
        }
    }
    saveCommentBoxes();
}

void GraphEditorComponent::updateCommentBoxes()
{
    // Update positions from data
    for (auto* box : commentBoxes)
    {
        box->updateFromData();
    }
}

void GraphEditorComponent::saveCommentBoxes()
{
    if (! graph.isValid())
        return;

    // Get or create UI value tree
    ValueTree uiData = graph.getUIValueTree();
    if (! uiData.isValid())
    {
        uiData = ValueTree (tags::ui);
        graph.data().addChild (uiData, -1, nullptr);
    }

    // Remove existing comment boxes data
    ValueTree existingBoxes = uiData.getChildWithName ("CommentBoxes");
    if (existingBoxes.isValid())
        uiData.removeChild (existingBoxes, nullptr);

    // Create new comment boxes container
    ValueTree boxesData ("CommentBoxes");
    for (auto* box : commentBoxes)
    {
        box->saveToData();
        boxesData.addChild (box->getData().createCopy(), -1, nullptr);
    }

    uiData.addChild (boxesData, -1, nullptr);
}

void GraphEditorComponent::loadCommentBoxes()
{
    commentBoxes.clear();

    if (! graph.isValid())
        return;

    ValueTree uiData = graph.getUIValueTree();
    if (! uiData.isValid())
        return;

    ValueTree boxesData = uiData.getChildWithName ("CommentBoxes");
    if (! boxesData.isValid())
        return;

    for (int i = 0; i < boxesData.getNumChildren(); ++i)
    {
        ValueTree boxData = boxesData.getChild (i);
        if (! boxData.hasType ("CommentBox"))
            continue;

        auto* box = new CommentBoxComponent (boxData.createCopy());
        box->onDeleteRequested = [this] (CommentBoxComponent* b) {
            deleteCommentBox (b);
        };
        box->onDataChanged = [this] (CommentBoxComponent*) {
            saveCommentBoxes();
        };
        box->onNodesMovedWithBox = [this] (CommentBoxComponent*) {
            updateConnectorComponents();
        };

        addAndMakeVisible (box, 0);
        commentBoxes.add (box);
    }
}

//=============================================================================
// Molecule Methods

void GraphEditorComponent::saveSelectionAsMolecule()
{
    if (selectedNodes.getNumSelected() == 0)
        return;

    // Get the selected node IDs
    Array<uint32> nodeIds;
    for (auto nodeId : selectedNodes)
        nodeIds.add (nodeId);

    // Show dialog to get molecule name
    auto* aw = new AlertWindow ("Save as Molecule",
                                 "Enter a name for this molecule:",
                                 MessageBoxIconType::QuestionIcon);
    aw->addTextEditor ("name", "My Molecule", "Name:");
    aw->addTextEditor ("description", "", "Description (optional):");
    aw->addButton ("Cancel", 0, KeyPress (KeyPress::escapeKey));
    aw->addButton ("Save", 1, KeyPress (KeyPress::returnKey));

    juce::Component::SafePointer<GraphEditorComponent> safeThis (this);
    aw->enterModalState (true, ModalCallbackFunction::create ([safeThis, nodeIds] (int result)
    {
        if (safeThis == nullptr)
            return;

        if (result != 1)
            return;

        // Get name from the dialog
        auto* aw = dynamic_cast<AlertWindow*> (Component::getCurrentlyModalComponent());
        if (aw == nullptr)
            return;

        String name = aw->getTextEditorContents ("name").trim();
        String description = aw->getTextEditorContents ("description").trim();

        if (name.isEmpty())
        {
            AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon,
                                              "Error", "Please enter a name for the molecule.");
            return;
        }

        // Create the molecule
        auto molecule = Molecule::createFromSelection (safeThis->graph, nodeIds, name);
        if (! molecule.isValid())
        {
            AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon,
                                              "Error", "Failed to create molecule from selection.");
            return;
        }

        // Set description if provided
        if (description.isNotEmpty())
            molecule.setDescription (description);

        // Save to library
        if (safeThis->moleculeLibrary.addMolecule (molecule))
        {
            AlertWindow::showMessageBoxAsync (MessageBoxIconType::InfoIcon,
                                              "Molecule Saved",
                                              "\"" + name + "\" has been saved to your molecule library.");
        }
        else
        {
            AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon,
                                              "Error", "Failed to save molecule to library.");
        }
    }), true);
}

void GraphEditorComponent::insertMolecule (const Molecule& mol)
{
    if (! mol.isValid() || ! graph.isValid())
        return;

    // Get the nodes data from the molecule
    ValueTree moleculeData = mol.data();
    ValueTree nodesData = moleculeData.getChildWithName (tags::nodes);
    ValueTree arcsData = moleculeData.getChildWithName (tags::arcs);

    if (nodesData.getNumChildren() == 0)
    {
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon,
                                          "Error", "This molecule contains no nodes.");
        return;
    }

    // Calculate insertion offset based on last drop position
    double offsetX = lastDropX;
    double offsetY = lastDropY;

    // Insert each node from the molecule
    for (int i = 0; i < nodesData.getNumChildren(); ++i)
    {
        ValueTree nodeData = nodesData.getChild (i).createCopy();
        // Original node ID is stored for potential future connection remapping
        ignoreUnused (nodeData.getProperty ("originalNodeId", -1));

        // Adjust position relative to drop point
        double x = static_cast<double> (nodeData.getProperty (tags::x, 0.0)) + offsetX;
        double y = static_cast<double> (nodeData.getProperty (tags::y, 0.0)) + offsetY;
        nodeData.setProperty (tags::x, x, nullptr);
        nodeData.setProperty (tags::y, y, nullptr);

        // Get plugin identifier
        String identifier = nodeData.getProperty (tags::identifier).toString();
        String formatName = nodeData.getProperty (tags::format).toString();

        if (identifier.isEmpty())
            continue;

        // Create PluginDescription from saved data
        PluginDescription desc;
        desc.fileOrIdentifier = identifier;
        desc.pluginFormatName = formatName.isEmpty() ? "Internal" : formatName;
        desc.name = nodeData.getProperty (tags::name).toString();

        // Add the plugin via message
        ViewHelpers::postMessageFor (this, new AddPluginMessage (graph, desc));

        // Note: For full molecule support, we'd need to:
        // 1. Wait for the node to be created
        // 2. Restore the saved state
        // 3. Recreate connections
        // This would require async processing or a different approach
    }

    // Show info message about connections
    if (arcsData.getNumChildren() > 0)
    {
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::InfoIcon,
                                          "Molecule Inserted",
                                          "Nodes from \"" + mol.getName() + "\" have been inserted.\n\n"
                                          "Note: Internal connections must be recreated manually.");
    }
}

//=============================================================================
// Alignment and Grid Methods

Point<int> GraphEditorComponent::snapPosition (Point<int> pos) const
{
    if (! snapToGrid || gridSize <= 0)
        return pos;

    return Point<int> (
        roundToInt (pos.getX() / static_cast<float> (gridSize)) * gridSize,
        roundToInt (pos.getY() / static_cast<float> (gridSize)) * gridSize
    );
}

Array<GraphEditorComponent::SnapGuide> GraphEditorComponent::getSnapGuides (BlockComponent* movingBlock, Point<int>& snappedDelta) const
{
    Array<SnapGuide> guides;
    snappedDelta = Point<int> (0, 0);

    if (movingBlock == nullptr)
        return guides;

    const auto movingBounds = movingBlock->getBounds();
    const int threshold = snapThreshold;

    // Collect edges of moving block
    const int movingLeft = movingBounds.getX();
    const int movingRight = movingBounds.getRight();
    const int movingTop = movingBounds.getY();
    const int movingBottom = movingBounds.getBottom();
    const int movingCenterX = movingBounds.getCentreX();
    const int movingCenterY = movingBounds.getCentreY();

    int bestSnapX = INT_MAX;
    int bestSnapY = INT_MAX;
    int snapDeltaX = 0;
    int snapDeltaY = 0;

    // Check against all other blocks
    for (int i = 0; i < getNumChildComponents(); ++i)
    {
        auto* otherBlock = dynamic_cast<BlockComponent*> (getChildComponent (i));
        if (otherBlock == nullptr || otherBlock == movingBlock || otherBlock->isSelected())
            continue;

        const auto otherBounds = otherBlock->getBounds();
        const int otherLeft = otherBounds.getX();
        const int otherRight = otherBounds.getRight();
        const int otherTop = otherBounds.getY();
        const int otherBottom = otherBounds.getBottom();
        const int otherCenterX = otherBounds.getCentreX();
        const int otherCenterY = otherBounds.getCentreY();

        // Check vertical alignments (X axis)
        // Left to left
        int delta = otherLeft - movingLeft;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapX))
        {
            bestSnapX = delta;
            snapDeltaX = delta;
        }
        // Right to right
        delta = otherRight - movingRight;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapX))
        {
            bestSnapX = delta;
            snapDeltaX = delta;
        }
        // Left to right
        delta = otherRight - movingLeft;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapX))
        {
            bestSnapX = delta;
            snapDeltaX = delta;
        }
        // Right to left
        delta = otherLeft - movingRight;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapX))
        {
            bestSnapX = delta;
            snapDeltaX = delta;
        }
        // Center to center (X)
        delta = otherCenterX - movingCenterX;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapX))
        {
            bestSnapX = delta;
            snapDeltaX = delta;
        }

        // Check horizontal alignments (Y axis)
        // Top to top
        delta = otherTop - movingTop;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapY))
        {
            bestSnapY = delta;
            snapDeltaY = delta;
        }
        // Bottom to bottom
        delta = otherBottom - movingBottom;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapY))
        {
            bestSnapY = delta;
            snapDeltaY = delta;
        }
        // Top to bottom
        delta = otherBottom - movingTop;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapY))
        {
            bestSnapY = delta;
            snapDeltaY = delta;
        }
        // Bottom to top
        delta = otherTop - movingBottom;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapY))
        {
            bestSnapY = delta;
            snapDeltaY = delta;
        }
        // Center to center (Y)
        delta = otherCenterY - movingCenterY;
        if (std::abs (delta) < threshold && std::abs (delta) < std::abs (bestSnapY))
        {
            bestSnapY = delta;
            snapDeltaY = delta;
        }
    }

    // Create snap guides for visualization
    if (bestSnapX != INT_MAX)
    {
        int guideX = movingLeft + snapDeltaX;
        // Check if it's a center alignment
        if (snapDeltaX == (movingCenterX - movingLeft) || snapDeltaX == 0)
            guideX = movingCenterX + snapDeltaX;

        SnapGuide guide;
        guide.horizontal = false; // Vertical line
        guide.position = guideX;
        guide.start = 0;
        guide.end = getHeight();
        guides.add (guide);
    }

    if (bestSnapY != INT_MAX)
    {
        int guideY = movingTop + snapDeltaY;
        // Check if it's a center alignment
        if (snapDeltaY == (movingCenterY - movingTop) || snapDeltaY == 0)
            guideY = movingCenterY + snapDeltaY;

        SnapGuide guide;
        guide.horizontal = true; // Horizontal line
        guide.position = guideY;
        guide.start = 0;
        guide.end = getWidth();
        guides.add (guide);
    }

    snappedDelta = Point<int> (snapDeltaX, snapDeltaY);
    return guides;
}

// Helper to get selected blocks
static Array<BlockComponent*> getSelectedBlocks (GraphEditorComponent* editor)
{
    Array<BlockComponent*> blocks;
    for (int i = 0; i < editor->getNumChildComponents(); ++i)
    {
        if (auto* block = dynamic_cast<BlockComponent*> (editor->getChildComponent (i)))
        {
            if (block->isSelected())
                blocks.add (block);
        }
    }
    return blocks;
}

void GraphEditorComponent::alignSelectedNodesLeft()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the leftmost position
    int minX = blocks[0]->getX();
    for (auto* block : blocks)
        minX = jmin (minX, block->getX());

    // Apply snap-to-grid if enabled
    if (snapToGrid)
        minX = snapPosition (Point<int> (minX, 0)).getX();

    // Align all blocks to the left
    for (auto* block : blocks)
    {
        block->moveBlockTo (minX, block->getY());
    }

    updateConnectorComponents();
}

void GraphEditorComponent::alignSelectedNodesRight()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the rightmost position
    int maxRight = blocks[0]->getRight();
    for (auto* block : blocks)
        maxRight = jmax (maxRight, block->getRight());

    // Align all blocks to the right
    for (auto* block : blocks)
    {
        int newX = maxRight - block->getWidth();
        if (snapToGrid)
            newX = snapPosition (Point<int> (newX, 0)).getX();
        block->moveBlockTo (newX, block->getY());
    }

    updateConnectorComponents();
}

void GraphEditorComponent::alignSelectedNodesTop()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the topmost position
    int minY = blocks[0]->getY();
    for (auto* block : blocks)
        minY = jmin (minY, block->getY());

    if (snapToGrid)
        minY = snapPosition (Point<int> (0, minY)).getY();

    // Align all blocks to the top
    for (auto* block : blocks)
    {
        block->moveBlockTo (block->getX(), minY);
    }

    updateConnectorComponents();
}

void GraphEditorComponent::alignSelectedNodesBottom()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the bottommost position
    int maxBottom = blocks[0]->getBottom();
    for (auto* block : blocks)
        maxBottom = jmax (maxBottom, block->getBottom());

    // Align all blocks to the bottom
    for (auto* block : blocks)
    {
        int newY = maxBottom - block->getHeight();
        if (snapToGrid)
            newY = snapPosition (Point<int> (0, newY)).getY();
        block->moveBlockTo (block->getX(), newY);
    }

    updateConnectorComponents();
}

void GraphEditorComponent::alignSelectedNodesCenterHorizontal()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the center Y position of all blocks
    int minY = blocks[0]->getY();
    int maxY = blocks[0]->getBottom();
    for (auto* block : blocks)
    {
        minY = jmin (minY, block->getY());
        maxY = jmax (maxY, block->getBottom());
    }
    int centerY = (minY + maxY) / 2;

    // Align all blocks to the center Y
    for (auto* block : blocks)
    {
        int newY = centerY - block->getHeight() / 2;
        if (snapToGrid)
            newY = snapPosition (Point<int> (0, newY)).getY();
        block->moveBlockTo (block->getX(), newY);
    }

    updateConnectorComponents();
}

void GraphEditorComponent::alignSelectedNodesCenterVertical()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 2)
        return;

    // Find the center X position of all blocks
    int minX = blocks[0]->getX();
    int maxX = blocks[0]->getRight();
    for (auto* block : blocks)
    {
        minX = jmin (minX, block->getX());
        maxX = jmax (maxX, block->getRight());
    }
    int centerX = (minX + maxX) / 2;

    // Align all blocks to the center X
    for (auto* block : blocks)
    {
        int newX = centerX - block->getWidth() / 2;
        if (snapToGrid)
            newX = snapPosition (Point<int> (newX, 0)).getX();
        block->moveBlockTo (newX, block->getY());
    }

    updateConnectorComponents();
}

void GraphEditorComponent::distributeSelectedNodesHorizontally()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 3)
        return;

    // Sort blocks by X position
    std::sort (blocks.begin(), blocks.end(),
               [] (const BlockComponent* a, const BlockComponent* b) {
                   return a->getX() < b->getX();
               });

    // Find the leftmost and rightmost positions
    int minX = blocks.getFirst()->getX();
    int maxX = blocks.getLast()->getRight();

    // Calculate total width of all blocks
    int totalWidth = 0;
    for (auto* block : blocks)
        totalWidth += block->getWidth();

    // Calculate spacing between blocks
    int availableSpace = maxX - minX - totalWidth;
    int spacing = availableSpace / (blocks.size() - 1);

    // Distribute blocks
    int currentX = minX;
    for (auto* block : blocks)
    {
        int newX = currentX;
        if (snapToGrid)
            newX = snapPosition (Point<int> (newX, 0)).getX();
        block->moveBlockTo (newX, block->getY());
        currentX += block->getWidth() + spacing;
    }

    updateConnectorComponents();
}

void GraphEditorComponent::distributeSelectedNodesVertically()
{
    auto blocks = getSelectedBlocks (this);
    if (blocks.size() < 3)
        return;

    // Sort blocks by Y position
    std::sort (blocks.begin(), blocks.end(),
               [] (const BlockComponent* a, const BlockComponent* b) {
                   return a->getY() < b->getY();
               });

    // Find the topmost and bottommost positions
    int minY = blocks.getFirst()->getY();
    int maxY = blocks.getLast()->getBottom();

    // Calculate total height of all blocks
    int totalHeight = 0;
    for (auto* block : blocks)
        totalHeight += block->getHeight();

    // Calculate spacing between blocks
    int availableSpace = maxY - minY - totalHeight;
    int spacing = availableSpace / (blocks.size() - 1);

    // Distribute blocks
    int currentY = minY;
    for (auto* block : blocks)
    {
        int newY = currentY;
        if (snapToGrid)
            newY = snapPosition (Point<int> (0, newY)).getY();
        block->moveBlockTo (block->getX(), newY);
        currentY += block->getHeight() + spacing;
    }

    updateConnectorComponents();
}

} // namespace element
