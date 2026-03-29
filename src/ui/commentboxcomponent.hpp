// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL3-or-later

#pragma once

#include "ElementApp.h"
#include <element/tags.hpp>

namespace element {

class GraphEditorComponent;
class BlockComponent;

/** A comment box/frame for organizing nodes in the graph editor.
    Similar to comment boxes in Unreal Engine Blueprints or Blender's Frame nodes.
*/
class CommentBoxComponent : public Component,
                            private TextEditor::Listener,
                            private ChangeListener
{
public:
    explicit CommentBoxComponent (const ValueTree& data)
        : boxData (data)
    {
        // Initialize from data or create defaults
        if (! boxData.isValid())
        {
            boxData = ValueTree ("CommentBox");
            boxData.setProperty ("title", "Comment", nullptr);
            boxData.setProperty ("color", Colour (0x40808080).toString(), nullptr);
            boxData.setProperty ("x", 0.0, nullptr);
            boxData.setProperty ("y", 0.0, nullptr);
            boxData.setProperty ("width", 200.0, nullptr);
            boxData.setProperty ("height", 150.0, nullptr);
        }

        // Title editor
        titleEditor.setMultiLine (false);
        titleEditor.setReturnKeyStartsNewLine (false);
        titleEditor.setPopupMenuEnabled (false);
        titleEditor.setScrollbarsShown (false);
        titleEditor.setCaretVisible (false);
        titleEditor.setReadOnly (true);
        titleEditor.setWantsKeyboardFocus (true);
        titleEditor.setColour (TextEditor::backgroundColourId, Colours::transparentBlack);
        titleEditor.setColour (TextEditor::outlineColourId, Colours::transparentBlack);
        titleEditor.setColour (TextEditor::focusedOutlineColourId, Colour (0x30FFFFFF));
        titleEditor.setColour (TextEditor::highlightColourId, Colours::white.withAlpha (0.3f));
        titleEditor.setColour (TextEditor::textColourId, Colours::white);
        titleEditor.setJustification (Justification::centredLeft);
        titleEditor.setText (boxData.getProperty ("title", "Comment").toString());
        titleEditor.addListener (this);
        titleEditor.setInterceptsMouseClicks (false, false); // Let parent handle double-click
        addAndMakeVisible (titleEditor);

        // Load position and size from data
        updateFromData();

        setMouseCursor (MouseCursor::NormalCursor);
    }

    ~CommentBoxComponent() override = default;

    void updateFromData()
    {
        double x = boxData.getProperty ("x", 0.0);
        double y = boxData.getProperty ("y", 0.0);
        double w = boxData.getProperty ("width", 200.0);
        double h = boxData.getProperty ("height", 150.0);
        setBounds (static_cast<int> (x), static_cast<int> (y),
                   static_cast<int> (w), static_cast<int> (h));
        boxColor = Colour::fromString (boxData.getProperty ("color", "40808080").toString());
        titleEditor.setText (boxData.getProperty ("title", "Comment").toString(), false);
    }

    void saveToData()
    {
        auto bounds = getBounds();
        boxData.setProperty ("x", static_cast<double> (bounds.getX()), nullptr);
        boxData.setProperty ("y", static_cast<double> (bounds.getY()), nullptr);
        boxData.setProperty ("width", static_cast<double> (bounds.getWidth()), nullptr);
        boxData.setProperty ("height", static_cast<double> (bounds.getHeight()), nullptr);
        boxData.setProperty ("title", titleEditor.getText(), nullptr);
        boxData.setProperty ("color", boxColor.toString(), nullptr);
    }

    ValueTree& getData() { return boxData; }
    const ValueTree& getData() const { return boxData; }

    void setTitle (const String& title)
    {
        titleEditor.setText (title, false);
        boxData.setProperty ("title", title, nullptr);
    }

    String getTitle() const { return titleEditor.getText(); }

    void setBoxColor (const Colour& c)
    {
        boxColor = c;
        boxData.setProperty ("color", c.toString(), nullptr);
        repaint();
    }

    Colour getBoxColor() const { return boxColor; }

    void paint (Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat();
        const float cornerSize = 6.0f;
        const float headerHeight = 28.0f;

        // Background fill
        g.setColour (boxColor);
        g.fillRoundedRectangle (bounds, cornerSize);

        // Header background (darker)
        auto headerBounds = bounds.withHeight (headerHeight);
        g.setColour (boxColor.darker (0.3f));

        Path headerPath;
        headerPath.addRoundedRectangle (headerBounds.getX(), headerBounds.getY(),
                                        headerBounds.getWidth(), headerBounds.getHeight(),
                                        cornerSize, cornerSize, true, true, false, false);
        g.fillPath (headerPath);

        // Selection highlight
        if (isSelected)
        {
            g.setColour (Colours::white.withAlpha (0.3f));
            g.drawRoundedRectangle (getLocalBounds().toFloat().reduced (1), cornerSize, 2.0f);
        }

        // Border
        g.setColour (boxColor.brighter (0.2f));
        g.drawRoundedRectangle (getLocalBounds().toFloat().reduced (0.5f), cornerSize, 1.0f);

        // Resize handle indicator (bottom-right corner)
        if (isMouseOverOrDragging())
        {
            auto resizeArea = getResizeArea();
            g.setColour (Colours::white.withAlpha (0.5f));
            g.drawLine (static_cast<float> (resizeArea.getX() + resizeArea.getWidth() - 3),
                        static_cast<float> (resizeArea.getY() + 3),
                        static_cast<float> (resizeArea.getX() + 3),
                        static_cast<float> (resizeArea.getY() + resizeArea.getHeight() - 3), 1.5f);
            g.drawLine (static_cast<float> (resizeArea.getX() + resizeArea.getWidth() - 8),
                        static_cast<float> (resizeArea.getY() + 3),
                        static_cast<float> (resizeArea.getX() + 3),
                        static_cast<float> (resizeArea.getY() + resizeArea.getHeight() - 8), 1.5f);
        }
    }

    void resized() override
    {
        auto r = getLocalBounds();
        auto header = r.removeFromTop (28);
        titleEditor.setBounds (header.reduced (8, 4));
    }

    void mouseDown (const MouseEvent& e) override
    {
        if (e.mods.isRightButtonDown())
        {
            showContextMenu();
            return;
        }

        originalBounds = getBounds();
        isResizing = getResizeArea().contains (e.getPosition());
        isDragging = ! isResizing;

        // Update contained nodes list when starting to drag
        if (isDragging)
            updateContainedNodes();

        // Select on click
        isSelected = true;
        repaint();

        toFront (false);
    }

    void mouseDrag (const MouseEvent& e) override
    {
        if (isResizing)
        {
            auto newBounds = originalBounds.withWidth (jmax (100, originalBounds.getWidth() + e.getDistanceFromDragStartX()))
                                           .withHeight (jmax (80, originalBounds.getHeight() + e.getDistanceFromDragStartY()));
            setBounds (newBounds);
        }
        else if (isDragging)
        {
            auto newBounds = originalBounds.translated (e.getDistanceFromDragStartX(),
                                                        e.getDistanceFromDragStartY());
            // Prevent moving beyond top-left boundary
            if (newBounds.getX() < 0) newBounds.setX (0);
            if (newBounds.getY() < 0) newBounds.setY (0);

            // Move contained nodes with the box using their stored original offsets
            // This prevents drift and ensures nodes stay in correct relative positions
            if (containedNodes.size() > 0)
            {
                for (auto& nodeInfo : containedNodes)
                {
                    if (auto* comp = nodeInfo.component)
                    {
                        // Calculate target position based on comment box position + stored offset
                        int targetX = newBounds.getX() + nodeInfo.originalOffset.getX();
                        int targetY = newBounds.getY() + nodeInfo.originalOffset.getY();

                        // Check if it's a BlockComponent - use its moveBlockTo method
                        if (auto* block = dynamic_cast<BlockComponent*> (comp))
                        {
                            block->moveBlockTo (targetX, targetY);
                        }
                        else
                        {
                            comp->setTopLeftPosition (targetX, targetY);
                        }
                    }
                }
            }

            setBounds (newBounds);
        }
    }

    void mouseUp (const MouseEvent& e) override
    {
        juce::ignoreUnused (e);

        // If we were dragging and moved blocks, notify via callback
        if (isDragging && containedNodes.size() > 0 && onNodesMovedWithBox)
        {
            onNodesMovedWithBox (this);
        }

        isResizing = false;
        isDragging = false;
        saveToData();

        // Update contained nodes list after movement
        updateContainedNodes();
    }

    void mouseDoubleClick (const MouseEvent& e) override
    {
        // Double-click on header to edit title
        if (e.y < 28)
        {
            startEditing();
        }
    }

    /** Start editing the title - called from double-click or Rename menu */
    void startEditing()
    {
        titleEditor.setInterceptsMouseClicks (true, true);
        titleEditor.setReadOnly (false);
        titleEditor.setCaretVisible (true);
        titleEditor.grabKeyboardFocus();
        titleEditor.selectAll();
    }

    /** Stop editing and save */
    void stopEditing()
    {
        titleEditor.setReadOnly (true);
        titleEditor.setCaretVisible (false);
        titleEditor.setInterceptsMouseClicks (false, false);
        saveToData();
        if (onDataChanged)
            onDataChanged (this);
    }

    void mouseMove (const MouseEvent& e) override
    {
        if (getResizeArea().contains (e.getPosition()))
            setMouseCursor (MouseCursor::BottomRightCornerResizeCursor);
        else
            setMouseCursor (MouseCursor::NormalCursor);
    }

    bool hitTest (int x, int y) override
    {
        // Make it easier to drag by accepting clicks in larger areas
        auto bounds = getLocalBounds();
        auto header = bounds.removeFromTop (32); // Slightly taller header for easier grabbing
        auto borderSize = 12; // Larger border for easier edge-dragging

        // Header area (main drag area)
        if (header.contains (x, y))
            return true;

        // Border areas - left, right, top, bottom edges
        if (x < borderSize || x > getWidth() - borderSize)
            return true;
        if (y < borderSize || y > getHeight() - borderSize)
            return true;

        // Resize area (bottom-right corner)
        if (getResizeArea().contains (x, y))
            return true;

        // Also accept clicks in a small margin inside the content area
        // This makes it easier to select the comment box
        auto contentInset = 20;
        if (x < contentInset || x > getWidth() - contentInset)
            return true;

        return false;
    }

    void setSelected (bool selected)
    {
        if (isSelected != selected)
        {
            isSelected = selected;
            repaint();
        }
    }

    bool getSelected() const { return isSelected; }

    // Static helper to create bounds containing selected blocks
    static Rectangle<int> getBoundsForBlocks (const Array<Component*>& blocks, int padding = 20)
    {
        if (blocks.isEmpty())
            return Rectangle<int> (0, 0, 200, 150);

        Rectangle<int> bounds;
        for (auto* block : blocks)
        {
            if (bounds.isEmpty())
                bounds = block->getBounds();
            else
                bounds = bounds.getUnion (block->getBounds());
        }

        return bounds.expanded (padding);
    }

    /** Update the list of nodes contained within this comment box */
    void updateContainedNodes()
    {
        containedNodes.clear();
        auto myBounds = getBounds();

        if (auto* parent = getParentComponent())
        {
            for (int i = 0; i < parent->getNumChildComponents(); ++i)
            {
                auto* comp = parent->getChildComponent (i);
                // Skip self and other comment boxes
                if (comp == this || dynamic_cast<CommentBoxComponent*> (comp) != nullptr)
                    continue;

                // Check if this component's center is inside our bounds
                auto compBounds = comp->getBounds();
                auto center = compBounds.getCentre();

                if (myBounds.contains (center))
                {
                    ContainedNode node;
                    node.component = comp;
                    node.originalOffset = compBounds.getPosition() - myBounds.getPosition();
                    containedNodes.add (node);
                }
            }
        }
    }

    /** Get the number of contained nodes */
    int getNumContainedNodes() const { return containedNodes.size(); }

private:
    struct ContainedNode
    {
        Component* component { nullptr };
        Point<int> originalOffset;
    };

    ValueTree boxData;
    TextEditor titleEditor;
    Colour boxColor { 0x40808080 };
    Array<ContainedNode> containedNodes;

    bool isSelected { false };
    bool isResizing { false };
    bool isDragging { false };
    Rectangle<int> originalBounds;

    Rectangle<int> getResizeArea() const
    {
        return Rectangle<int> (getWidth() - 16, getHeight() - 16, 16, 16);
    }

    void showContextMenu()
    {
        PopupMenu menu;

        PopupMenu colorMenu;
        colorMenu.addItem (1, "Red", true, boxColor == Colour (0x40E03636));
        colorMenu.addItem (2, "Orange", true, boxColor == Colour (0x40E24B00));
        colorMenu.addItem (3, "Yellow", true, boxColor == Colour (0x40EDED00));
        colorMenu.addItem (4, "Green", true, boxColor == Colour (0x40247D21));
        colorMenu.addItem (5, "Blue", true, boxColor == Colour (0x402969BE));
        colorMenu.addItem (6, "Purple", true, boxColor == Colour (0x405627A1));
        colorMenu.addItem (7, "Gray", true, boxColor == Colour (0x40808080));
        colorMenu.addSeparator();
        colorMenu.addItem (102, "Custom Color...");

        menu.addSubMenu ("Color", colorMenu);
        menu.addSeparator();
        menu.addItem (100, "Rename");
        menu.addItem (101, "Delete");

        menu.showMenuAsync (PopupMenu::Options(), [this] (int result) {
            if (result >= 1 && result <= 7)
            {
                Colour colors[] = {
                    Colour (0x40E03636),  // Red
                    Colour (0x40E24B00),  // Orange
                    Colour (0x40EDED00),  // Yellow
                    Colour (0x40247D21),  // Green
                    Colour (0x402969BE),  // Blue
                    Colour (0x405627A1),  // Purple
                    Colour (0x40808080)   // Gray
                };
                setBoxColor (colors[result - 1]);
            }
            else if (result == 100)
            {
                startEditing();
            }
            else if (result == 102)
            {
                // Custom color picker
                showColorPicker();
            }
            else if (result == 101)
            {
                // Signal deletion - parent will handle
                if (onDeleteRequested)
                    onDeleteRequested (this);
            }
        });
    }

    void textEditorReturnKeyPressed (TextEditor&) override
    {
        stopEditing();
    }

    void textEditorEscapeKeyPressed (TextEditor&) override
    {
        titleEditor.setText (boxData.getProperty ("title", "Comment").toString(), false);
        titleEditor.setReadOnly (true);
        titleEditor.setCaretVisible (false);
        titleEditor.setInterceptsMouseClicks (false, false);
    }

    void textEditorFocusLost (TextEditor&) override
    {
        if (! titleEditor.isReadOnly())
        {
            stopEditing();
        }
    }

    void showColorPicker()
    {
        auto* picker = new ColourSelector (ColourSelector::showColourAtTop
                                            | ColourSelector::showSliders
                                            | ColourSelector::showColourspace);
        picker->setSize (300, 400);
        picker->setCurrentColour (boxColor.withAlpha (1.0f));

        picker->addChangeListener (this);

        // We need to make this a ChangeListener, but since we're not inheriting from it,
        // use a lambda-based approach with CallOutBox
        auto& box = CallOutBox::launchAsynchronously (std::unique_ptr<Component> (picker),
                                                       getScreenBounds().removeFromTop (28),
                                                       nullptr);
        juce::ignoreUnused (box);
    }

    // Handle color picker changes - requires deriving from ChangeListener
    void changeListenerCallback (ChangeBroadcaster* source) override
    {
        if (auto* picker = dynamic_cast<ColourSelector*> (source))
        {
            // Apply the selected color with semi-transparency for the comment box
            setBoxColor (picker->getCurrentColour().withAlpha (0.25f));
        }
    }

public:
    std::function<void (CommentBoxComponent*)> onDeleteRequested;
    std::function<void (CommentBoxComponent*)> onDataChanged;
    std::function<void (CommentBoxComponent*)> onNodesMovedWithBox;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (CommentBoxComponent)
};

} // namespace element
