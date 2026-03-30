// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.hpp>
#include <element/ui/style.hpp>

#include "ui/guicommon.hpp"
#include "ui/grapheditorcomponent.hpp"

namespace element {

/** Toolbar displayed above the graph editor with breadcrumb navigation,
    zoom controls, and optional toggle buttons for snap/layout/comment. */
class GraphEditorToolbar : public Component
{
public:
    GraphEditorToolbar()
    {
        setOpaque (true);
        setSize (600, toolbarHeight);
    }

    ~GraphEditorToolbar() override = default;

    /** Connect to the graph editor for zoom/snap/layout/comment actions. */
    void setGraphEditor (GraphEditorComponent* editor)
    {
        graphEditor = editor;
        updateZoomLabel();
        repaint();
    }

    /** Update breadcrumb to show hierarchy for the given node. */
    void setBreadcrumbNode (const Node& newNode)
    {
        breadcrumbNodes.clear();

        if (! newNode.isValid())
        {
            segments.clear();
            repaint();
            return;
        }

        // Walk up the parent chain and collect nodes root-first
        breadcrumbNodes.insert (0, newNode);
        Node parent = newNode.getParentGraph();
        while (parent.isValid())
        {
            breadcrumbNodes.insert (0, parent);
            parent = parent.getParentGraph();
        }

        rebuildBreadcrumbSegments (getBreadcrumbAvailableWidth());
        repaint();
    }

    /** Callback fired when a breadcrumb ancestor segment is clicked.
        The Node passed is the ancestor that was clicked. */
    std::function<void (const Node&)> onBreadcrumbClicked;

    //==========================================================================
    void paint (Graphics& g) override
    {
        // Background
        g.fillAll (Colour (0xff1e2123));

        // Bottom border
        g.setColour (Colour (0xff0d0f10));
        g.fillRect (0, getHeight() - 1, getWidth(), 1);

        // Paint breadcrumb segments
        paintBreadcrumb (g);
    }

    void resized() override
    {
        updateToolbarLayout();
    }

    void mouseMove (const MouseEvent& e) override
    {
        int newHovered = hitTestSegment (e.getPosition());
        if (newHovered != hoveredSegment)
        {
            hoveredSegment = newHovered;
            repaint();
        }

        // Set cursor to pointing hand for clickable segments or zoom label
        if (hoveredSegment >= 0 && hoveredSegment < segments.size() && ! segments[hoveredSegment].isLeaf)
            setMouseCursor (MouseCursor::PointingHandCursor);
        else if (zoomLabelBounds.contains (e.getPosition()))
            setMouseCursor (MouseCursor::PointingHandCursor);
        else
            setMouseCursor (MouseCursor::NormalCursor);
    }

    void mouseExit (const MouseEvent&) override
    {
        if (hoveredSegment != -1)
        {
            hoveredSegment = -1;
            repaint();
        }
        setMouseCursor (MouseCursor::NormalCursor);
    }

    void mouseDown (const MouseEvent& e) override
    {
        // Check breadcrumb clicks
        int seg = hitTestSegment (e.getPosition());
        if (seg >= 0 && seg < segments.size() && ! segments[seg].isLeaf)
        {
            if (onBreadcrumbClicked && seg < breadcrumbNodes.size())
                onBreadcrumbClicked (breadcrumbNodes[seg]);
            return;
        }

        // Check zoom label click (reset to 100%)
        if (zoomLabelBounds.contains (e.getPosition()))
        {
            if (graphEditor != nullptr)
            {
                graphEditor->setZoomScale (1.0f);
                updateZoomLabel();
                repaint();
            }
            return;
        }

        // Check button hits
        if (zoomOutBounds.contains (e.getPosition()))
        {
            zoomOut();
            return;
        }
        if (zoomInBounds.contains (e.getPosition()))
        {
            zoomIn();
            return;
        }
        if (fitBounds.contains (e.getPosition()))
        {
            fitToView();
            return;
        }

        const bool isWide = getWidth() >= compactThreshold;
        if (isWide)
        {
            if (snapBounds.contains (e.getPosition()))
            {
                toggleSnap();
                return;
            }
            if (layoutBounds.contains (e.getPosition()))
            {
                toggleLayout();
                return;
            }
            if (commentBounds.contains (e.getPosition()))
            {
                createComment();
                return;
            }
        }
    }

    void updateZoomLabel()
    {
        if (graphEditor != nullptr)
        {
            int pct = juce::roundToInt (graphEditor->getZoomScale() * 100.0f);
            zoomText = String (pct) + "%";
        }
        else
        {
            zoomText = "100%";
        }
    }

private:
    static constexpr int toolbarHeight = 28;
    static constexpr int buttonSize = 20;
    static constexpr int buttonY = 4;
    static constexpr int compactThreshold = 520;
    static constexpr int zoomLabelWidth = 42;
    static constexpr int dividerWidth = 1;
    static constexpr int dividerHeight = 16;

    // Colors from spec
    static constexpr uint32 colBtnIcon        = 0xff8a9099;
    static constexpr uint32 colBtnHoverBg     = 0xff2e3235;
    static constexpr uint32 colBtnHoverIcon   = 0xffcccccc;
    static constexpr uint32 colBtnPressedBg   = 0xff3b3f45;
    static constexpr uint32 colBtnPressedIcon = 0xffffffff;
    static constexpr uint32 colToggleOnBg     = 0xff1f3260;
    static constexpr uint32 colToggleOnIcon   = 0xff33aaf9;
    static constexpr uint32 colAncestorText   = 0xff6b7280;
    static constexpr uint32 colLeafText       = 0xffcccccc;
    static constexpr uint32 colHoverBg        = 0xff2e3235;
    static constexpr uint32 colHoverText      = 0xffffffff;
    static constexpr uint32 colDivider        = 0xff2e3235;

    GraphEditorComponent* graphEditor = nullptr;

    // Breadcrumb data
    Array<Node> breadcrumbNodes;
    int hoveredSegment = -1;

    struct BreadcrumbSegment
    {
        String text;
        Rectangle<int> bounds;
        bool isLeaf;
    };
    Array<BreadcrumbSegment> segments;

    // Button bounds
    Rectangle<int> zoomOutBounds, zoomInBounds, fitBounds, zoomLabelBounds;
    Rectangle<int> snapBounds, layoutBounds, commentBounds;

    String zoomText { "100%" };

    //==========================================================================
    // Icon path builders
    //==========================================================================
    static Path makeZoomOutIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        p.addRectangle (cx - 4.0f, cy - 0.75f, 8.0f, 1.5f);
        return p;
    }

    static Path makeZoomInIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        p.addRectangle (cx - 4.0f, cy - 0.75f, 8.0f, 1.5f);
        p.addRectangle (cx - 0.75f, cy - 4.0f, 1.5f, 8.0f);
        return p;
    }

    static Path makeFitIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        float half = 5.0f;
        float arrow = 2.5f;
        float t = 1.0f;

        // Top-left arrow head
        p.startNewSubPath (cx - half, cy - half);
        p.lineTo (cx - half + arrow, cy - half);
        p.startNewSubPath (cx - half, cy - half);
        p.lineTo (cx - half, cy - half + arrow);

        // Top-right
        p.startNewSubPath (cx + half, cy - half);
        p.lineTo (cx + half - arrow, cy - half);
        p.startNewSubPath (cx + half, cy - half);
        p.lineTo (cx + half, cy - half + arrow);

        // Bottom-left
        p.startNewSubPath (cx - half, cy + half);
        p.lineTo (cx - half + arrow, cy + half);
        p.startNewSubPath (cx - half, cy + half);
        p.lineTo (cx - half, cy + half - arrow);

        // Bottom-right
        p.startNewSubPath (cx + half, cy + half);
        p.lineTo (cx + half - arrow, cy + half);
        p.startNewSubPath (cx + half, cy + half);
        p.lineTo (cx + half, cy + half - arrow);

        return p;
    }

    static Path makeSnapGridIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        float spacing = 4.0f;
        float radius = 1.5f;

        for (int row = -1; row <= 1; ++row)
            for (int col = -1; col <= 1; ++col)
                p.addEllipse (cx + col * spacing - radius,
                              cy + row * spacing - radius,
                              radius * 2.0f, radius * 2.0f);
        return p;
    }

    static Path makeLayoutHIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        // Two rectangles side by side (horizontal layout)
        p.addRoundedRectangle (cx - 5.0f, cy - 3.5f, 4.0f, 7.0f, 0.5f);
        p.addRoundedRectangle (cx + 1.0f, cy - 3.5f, 4.0f, 7.0f, 0.5f);
        return p;
    }

    static Path makeLayoutVIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        // Two rectangles stacked (vertical layout)
        p.addRoundedRectangle (cx - 3.5f, cy - 5.0f, 7.0f, 4.0f, 0.5f);
        p.addRoundedRectangle (cx - 3.5f, cy + 1.0f, 7.0f, 4.0f, 0.5f);
        return p;
    }

    static Path makeCommentBoxIcon (Rectangle<int> area)
    {
        Path p;
        float cx = area.getCentreX();
        float cy = area.getCentreY();
        p.addRoundedRectangle (cx - 4.5f, cy - 3.5f, 9.0f, 7.0f, 1.0f);
        return p;
    }

    //==========================================================================
    // Button painting
    //==========================================================================
    void paintButton (Graphics& g, Rectangle<int> bounds, const Path& icon,
                      bool isToggle, bool toggleState, bool isStroke = false) const
    {
        bool isHovered = bounds.contains (getMouseXYRelative());

        if (isToggle && toggleState)
        {
            g.setColour (Colour (colToggleOnBg));
            g.fillRoundedRectangle (bounds.toFloat(), 3.0f);
            g.setColour (Colour (colToggleOnIcon));
        }
        else if (isHovered)
        {
            g.setColour (Colour (colBtnHoverBg));
            g.fillRoundedRectangle (bounds.toFloat(), 3.0f);
            g.setColour (Colour (colBtnHoverIcon));
        }
        else
        {
            g.setColour (Colour (colBtnIcon));
        }

        if (isStroke)
            g.strokePath (icon, PathStrokeType (1.5f));
        else
            g.fillPath (icon);
    }

    //==========================================================================
    // Text measurement helper (avoids deprecated Font::getStringWidthFloat)
    //==========================================================================
    static int measureTextWidth (const Font& font, const String& text)
    {
        GlyphArrangement glyphs;
        glyphs.addLineOfText (font, text, 0.0f, 0.0f);
        return juce::roundToInt (glyphs.getBoundingBox (0, -1, true).getWidth());
    }

    //==========================================================================
    // Breadcrumb
    //==========================================================================
    void rebuildBreadcrumbSegments (int availableWidth)
    {
        segments.clear();
        if (breadcrumbNodes.isEmpty())
            return;

        const Font font (FontOptions (12.0f));
        const int divSpace = 12; // space for "/" divider
        const int hPad = 8;     // horizontal padding per segment
        const int minSegWidth = 18;

        // Build initial segments with full text
        Array<BreadcrumbSegment> fullSegs;
        int totalWidth = 0;

        for (int i = 0; i < breadcrumbNodes.size(); ++i)
        {
            BreadcrumbSegment seg;
            seg.text = breadcrumbNodes[i].getName();
            seg.isLeaf = (i == breadcrumbNodes.size() - 1);

            int textW = measureTextWidth (font, seg.text);
            int segW = textW + hPad;
            seg.bounds = { 0, 0, segW, toolbarHeight };

            totalWidth += segW;
            if (i > 0)
                totalWidth += divSpace;

            fullSegs.add (seg);
        }

        // Truncation pass if needed
        if (totalWidth > availableWidth && fullSegs.size() > 1)
        {
            // Step 1: shorten ancestors to first 2 chars + ellipsis
            for (int i = 0; i < fullSegs.size() - 1; ++i)
            {
                auto& seg = fullSegs.getReference (i);
                if (seg.text.length() > 4)
                {
                    seg.text = seg.text.substring (0, 2) + String (CharPointer_UTF8 ("\xe2\x80\xa6"));
                    int textW = measureTextWidth (font, seg.text);
                    seg.bounds.setWidth (jmax (minSegWidth, textW + hPad));
                }
            }

            // Recalculate total
            totalWidth = 0;
            for (int i = 0; i < fullSegs.size(); ++i)
            {
                totalWidth += fullSegs[i].bounds.getWidth();
                if (i > 0)
                    totalWidth += divSpace;
            }

            // Step 2: replace distant ancestors with "..."
            if (totalWidth > availableWidth && fullSegs.size() > 2)
            {
                int ellipsisW = measureTextWidth (font, String (CharPointer_UTF8 ("\xe2\x80\xa6"))) + hPad;

                // Keep first, last, and replace middle with single ellipsis
                Array<BreadcrumbSegment> collapsed;
                collapsed.add (fullSegs[0]);

                BreadcrumbSegment ellipsisSeg;
                ellipsisSeg.text = String (CharPointer_UTF8 ("\xe2\x80\xa6"));
                ellipsisSeg.isLeaf = false;
                ellipsisSeg.bounds = { 0, 0, jmax (16, ellipsisW), toolbarHeight };
                collapsed.add (ellipsisSeg);

                collapsed.add (fullSegs.getLast());
                fullSegs = collapsed;

                // Recalculate
                totalWidth = 0;
                for (int i = 0; i < fullSegs.size(); ++i)
                {
                    totalWidth += fullSegs[i].bounds.getWidth();
                    if (i > 0)
                        totalWidth += divSpace;
                }
            }

            // Step 3: truncate leaf text as last resort
            if (totalWidth > availableWidth)
            {
                auto& leaf = fullSegs.getReference (fullSegs.size() - 1);
                int otherWidth = totalWidth - leaf.bounds.getWidth();
                int maxLeafW = jmax (minSegWidth, availableWidth - otherWidth);
                leaf.bounds.setWidth (maxLeafW);

                // Truncate text to fit
                String truncated = leaf.text;
                while (truncated.length() > 1)
                {
                    truncated = truncated.substring (0, truncated.length() - 1);
                    String candidate = truncated + String (CharPointer_UTF8 ("\xe2\x80\xa6"));
                    int w = measureTextWidth (font, candidate) + hPad;
                    if (w <= maxLeafW)
                    {
                        leaf.text = candidate;
                        break;
                    }
                }
            }
        }

        // Position segments
        int x = 8; // left margin
        for (int i = 0; i < fullSegs.size(); ++i)
        {
            if (i > 0)
                x += divSpace;
            fullSegs.getReference (i).bounds.setX (x);
            fullSegs.getReference (i).bounds.setY (0);
            x += fullSegs[i].bounds.getWidth();
        }

        segments = fullSegs;
    }

    void paintBreadcrumb (Graphics& g) const
    {
        const Font font (FontOptions (12.0f));
        g.setFont (font);

        for (int i = 0; i < segments.size(); ++i)
        {
            const auto& seg = segments.getReference (i);

            // Draw divider before segment (except first)
            if (i > 0)
            {
                int divX = seg.bounds.getX() - 7;
                int divY = (toolbarHeight - dividerHeight) / 2;
                g.setColour (Colour (colDivider));
                g.fillRect (divX, divY, dividerWidth, dividerHeight);
            }

            // Hover background for non-leaf
            if (! seg.isLeaf && i == hoveredSegment)
            {
                g.setColour (Colour (colHoverBg));
                g.fillRoundedRectangle (seg.bounds.toFloat(), 3.0f);
                g.setColour (Colour (colHoverText));
            }
            else if (seg.isLeaf)
            {
                g.setColour (Colour (colLeafText));
            }
            else
            {
                g.setColour (Colour (colAncestorText));
            }

            g.drawText (seg.text, seg.bounds, Justification::centred, true);
        }
    }

    int hitTestSegment (Point<int> pos) const
    {
        for (int i = 0; i < segments.size(); ++i)
            if (segments[i].bounds.contains (pos))
                return i;
        return -1;
    }

    int getBreadcrumbAvailableWidth() const
    {
        // Total width minus right-side controls
        int rightWidth = getZoomControlsWidth();
        const bool isWide = getWidth() >= compactThreshold;
        if (isWide)
            rightWidth += getOptionalControlsWidth() + 8; // separator gap
        return jmax (60, getWidth() - rightWidth - 16);
    }

    int getZoomControlsWidth() const
    {
        // [-] 42px [+] [fit] with 4px gaps
        return buttonSize + 4 + zoomLabelWidth + 4 + buttonSize + 4 + buttonSize;
    }

    int getOptionalControlsWidth() const
    {
        // [snap] [layout] [comment] with 4px gaps
        return buttonSize + 4 + buttonSize + 4 + buttonSize;
    }

    //==========================================================================
    // Layout
    //==========================================================================
    void updateToolbarLayout()
    {
        const bool isWide = getWidth() >= compactThreshold;

        auto r = getLocalBounds();
        r.removeFromRight (8); // right margin

        // Zoom controls always on the right
        int zoomW = getZoomControlsWidth();
        auto zoomArea = r.removeFromRight (zoomW);

        // Position zoom buttons right-to-left
        int zx = zoomArea.getX();
        zoomOutBounds = { zx, buttonY, buttonSize, buttonSize };
        zx += buttonSize + 4;
        zoomLabelBounds = { zx, buttonY, zoomLabelWidth, buttonSize };
        zx += zoomLabelWidth + 4;
        zoomInBounds = { zx, buttonY, buttonSize, buttonSize };
        zx += buttonSize + 4;
        fitBounds = { zx, buttonY, buttonSize, buttonSize };

        // Optional controls between breadcrumb and zoom
        if (isWide)
        {
            r.removeFromRight (8); // gap before zoom
            int optW = getOptionalControlsWidth();
            auto optArea = r.removeFromRight (optW);
            int ox = optArea.getX();
            snapBounds = { ox, buttonY, buttonSize, buttonSize };
            ox += buttonSize + 4;
            layoutBounds = { ox, buttonY, buttonSize, buttonSize };
            ox += buttonSize + 4;
            commentBounds = { ox, buttonY, buttonSize, buttonSize };

            r.removeFromRight (8); // divider gap
        }
        else
        {
            snapBounds = {};
            layoutBounds = {};
            commentBounds = {};
        }

        // Rebuild breadcrumb for remaining space
        rebuildBreadcrumbSegments (r.getWidth() - 8);

        repaint();
    }

    //==========================================================================
    // Paint override for buttons
    //==========================================================================
    void paintOverChildren (Graphics& g) override
    {
        // Zoom out button
        paintButton (g, zoomOutBounds, makeZoomOutIcon (zoomOutBounds), false, false);

        // Zoom in button
        paintButton (g, zoomInBounds, makeZoomInIcon (zoomInBounds), false, false);

        // Fit to view button (stroke-based arrows)
        paintButton (g, fitBounds, makeFitIcon (fitBounds), false, false, true);

        // Zoom label
        {
            bool isHovered = zoomLabelBounds.contains (getMouseXYRelative());
            g.setColour (isHovered ? Colour (colBtnHoverIcon) : Colour (colBtnIcon));
            g.setFont (Font (FontOptions (11.0f)));
            g.drawText (zoomText, zoomLabelBounds, Justification::centredRight, false);
        }

        // Optional controls
        const bool isWide = getWidth() >= compactThreshold;
        if (isWide && graphEditor != nullptr)
        {
            bool snapOn = graphEditor->isSnapToGridEnabled();
            paintButton (g, snapBounds, makeSnapGridIcon (snapBounds), true, snapOn);

            bool vertLayout = graphEditor->isLayoutVertical();
            auto layoutIcon = vertLayout ? makeLayoutVIcon (layoutBounds)
                                         : makeLayoutHIcon (layoutBounds);
            paintButton (g, layoutBounds, layoutIcon, true, false);

            paintButton (g, commentBounds, makeCommentBoxIcon (commentBounds), false, false, true);
        }

        // Vertical divider between optional and zoom controls (if wide)
        if (isWide)
        {
            int divX = zoomOutBounds.getX() - 8;
            int divY = (toolbarHeight - dividerHeight) / 2;
            g.setColour (Colour (colDivider));
            g.fillRect (divX, divY, dividerWidth, dividerHeight);

            // Divider between breadcrumb and optional controls
            if (! snapBounds.isEmpty())
            {
                divX = snapBounds.getX() - 8;
                g.fillRect (divX, divY, dividerWidth, dividerHeight);
            }
        }
    }

    //==========================================================================
    // Actions
    //==========================================================================
    void zoomOut()
    {
        if (graphEditor == nullptr)
            return;
        float scale = graphEditor->getZoomScale();
        scale = jmax (0.25f, scale - 0.25f);
        graphEditor->setZoomScale (scale);
        updateZoomLabel();
        repaint();
    }

    void zoomIn()
    {
        if (graphEditor == nullptr)
            return;
        float scale = graphEditor->getZoomScale();
        scale = jmin (2.0f, scale + 0.25f);
        graphEditor->setZoomScale (scale);
        updateZoomLabel();
        repaint();
    }

    void fitToView()
    {
        if (graphEditor == nullptr)
            return;
        graphEditor->setZoomScale (1.0f);
        updateZoomLabel();
        repaint();
    }

    void toggleSnap()
    {
        if (graphEditor == nullptr)
            return;
        graphEditor->setSnapToGridEnabled (! graphEditor->isSnapToGridEnabled());
        repaint();
    }

    void toggleLayout()
    {
        if (graphEditor == nullptr)
            return;
        graphEditor->setVerticalLayout (! graphEditor->isLayoutVertical());
        repaint();
    }

    void createComment()
    {
        if (graphEditor == nullptr)
            return;
        graphEditor->createCommentBox();
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GraphEditorToolbar)
};

} // namespace element
