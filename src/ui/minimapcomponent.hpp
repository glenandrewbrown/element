// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include "ElementApp.h"
#include "ui/block.hpp"

namespace element {

class GraphEditorComponent;

/** A minimap/overview panel that shows a bird's eye view of the graph editor.
    Allows navigation by clicking or dragging on the minimap.
*/
class MinimapComponent : public Component,
                         private Timer
{
public:
    explicit MinimapComponent()
    {
        setOpaque (true);
        startTimerHz (10); // Update 10 times per second
    }

    ~MinimapComponent() override
    {
        stopTimer();
    }

    void setGraphEditor (GraphEditorComponent* editor)
    {
        graphEditor = editor;
        repaint();
    }

    void setViewport (Viewport* vp)
    {
        viewport = vp;
        repaint();
    }

    void paint (Graphics& g) override
    {
        // Background
        g.fillAll (Colour (0xFF1a1a1a));

        if (graphEditor == nullptr)
            return;

        // Calculate scaling
        auto graphBounds = getGraphBounds();
        if (graphBounds.isEmpty())
            return;

        const auto localBounds = getLocalBounds().reduced (4).toFloat();
        scale = jmin (localBounds.getWidth() / graphBounds.getWidth(),
                      localBounds.getHeight() / graphBounds.getHeight());

        // Center the minimap content
        float scaledWidth = graphBounds.getWidth() * scale;
        float scaledHeight = graphBounds.getHeight() * scale;
        offsetX = localBounds.getX() + (localBounds.getWidth() - scaledWidth) / 2.0f;
        offsetY = localBounds.getY() + (localBounds.getHeight() - scaledHeight) / 2.0f;

        // Draw nodes as small rectangles with their assigned colors
        for (int i = 0; i < graphEditor->getNumChildComponents(); ++i)
        {
            if (auto* block = dynamic_cast<BlockComponent*> (graphEditor->getChildComponent (i)))
            {
                auto blockBounds = block->getBounds().toFloat();
                auto minimapBounds = Rectangle<float> (
                    offsetX + (blockBounds.getX() - graphBounds.getX()) * scale,
                    offsetY + (blockBounds.getY() - graphBounds.getY()) * scale,
                    blockBounds.getWidth() * scale,
                    blockBounds.getHeight() * scale
                );

                // Use the block's color, or fallback to grey if no color set
                Colour blockColor = block->getColor();
                if (blockColor.isTransparent())
                    blockColor = Colours::lightgrey;

                // Make colors more visible on dark background
                if (block->isSelected())
                {
                    g.setColour (Colours::orange);
                }
                else
                {
                    // Brighten the color for better visibility in minimap
                    g.setColour (blockColor.brighter (0.3f).withAlpha (0.85f));
                }

                g.fillRoundedRectangle (minimapBounds, 2.0f);

                // Draw a thin border for better definition
                g.setColour (blockColor.darker (0.3f).withAlpha (0.6f));
                g.drawRoundedRectangle (minimapBounds, 2.0f, 0.5f);
            }
        }

        // Draw viewport indicator
        if (viewport != nullptr)
        {
            auto viewArea = viewport->getViewArea().toFloat();
            auto vpBounds = Rectangle<float> (
                offsetX + (viewArea.getX() - graphBounds.getX()) * scale,
                offsetY + (viewArea.getY() - graphBounds.getY()) * scale,
                viewArea.getWidth() * scale,
                viewArea.getHeight() * scale
            );

            g.setColour (Colours::white.withAlpha (0.3f));
            g.fillRect (vpBounds);
            g.setColour (Colours::white.withAlpha (0.8f));
            g.drawRect (vpBounds, 1.5f);
        }

        // Border
        g.setColour (Colours::grey);
        g.drawRect (getLocalBounds(), 1);
    }

    void mouseDown (const MouseEvent& e) override
    {
        navigateToPosition (e.getPosition());
    }

    void mouseDrag (const MouseEvent& e) override
    {
        navigateToPosition (e.getPosition());
    }

private:
    GraphEditorComponent* graphEditor { nullptr };
    Viewport* viewport { nullptr };
    float scale { 1.0f };
    float offsetX { 0.0f };
    float offsetY { 0.0f };

    void timerCallback() override
    {
        repaint();
    }

    Rectangle<float> getGraphBounds() const
    {
        if (graphEditor == nullptr)
            return Rectangle<float>();

        // Get bounds of the graph editor content
        float minX = std::numeric_limits<float>::max();
        float minY = std::numeric_limits<float>::max();
        float maxX = 0.0f;
        float maxY = 0.0f;

        bool hasBlocks = false;

        for (int i = 0; i < graphEditor->getNumChildComponents(); ++i)
        {
            if (auto* block = dynamic_cast<BlockComponent*> (graphEditor->getChildComponent (i)))
            {
                auto bounds = block->getBounds();
                minX = jmin (minX, static_cast<float> (bounds.getX()));
                minY = jmin (minY, static_cast<float> (bounds.getY()));
                maxX = jmax (maxX, static_cast<float> (bounds.getRight()));
                maxY = jmax (maxY, static_cast<float> (bounds.getBottom()));
                hasBlocks = true;
            }
        }

        if (! hasBlocks)
            return Rectangle<float> (0, 0,
                                     static_cast<float> (graphEditor->getWidth()),
                                     static_cast<float> (graphEditor->getHeight()));

        // Add padding
        const float padding = 50.0f;
        return Rectangle<float> (
            jmax (0.0f, minX - padding),
            jmax (0.0f, minY - padding),
            maxX - minX + padding * 2,
            maxY - minY + padding * 2
        );
    }

    void navigateToPosition (Point<int> minimapPos)
    {
        if (viewport == nullptr || graphEditor == nullptr)
            return;

        auto graphBounds = getGraphBounds();
        if (graphBounds.isEmpty() || scale <= 0.0f)
            return;

        // Convert minimap position to graph position
        float graphX = graphBounds.getX() + (minimapPos.getX() - offsetX) / scale;
        float graphY = graphBounds.getY() + (minimapPos.getY() - offsetY) / scale;

        // Center the viewport on this position
        int vpX = static_cast<int> (graphX - viewport->getViewWidth() / 2);
        int vpY = static_cast<int> (graphY - viewport->getViewHeight() / 2);

        viewport->setViewPosition (vpX, vpY);
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MinimapComponent)
};

} // namespace element
