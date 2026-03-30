// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include "ElementApp.h"
#include "ui/block.hpp"

namespace element {

class GraphEditorComponent;

/** A search popup for finding and selecting nodes in the graph editor.
    Activated with Ctrl+F (Cmd+F on Mac).
*/
class NodeSearchComponent : public Component,
                            public ListBoxModel,
                            private TextEditor::Listener,
                            private Timer
{
public:
    explicit NodeSearchComponent()
    {
        setOpaque (true);

        searchBox.setMultiLine (false);
        searchBox.setReturnKeyStartsNewLine (false);
        searchBox.setPopupMenuEnabled (false);
        searchBox.setScrollbarsShown (false);
        searchBox.setColour (TextEditor::backgroundColourId, Colour (0xFF2a2a2a));
        searchBox.setColour (TextEditor::outlineColourId, Colour (0xFF444444));
        searchBox.setColour (TextEditor::textColourId, Colours::white);
        searchBox.setTextToShowWhenEmpty ("Search nodes...", Colours::grey);
        searchBox.addListener (this);
        addAndMakeVisible (searchBox);

        resultsList.setRowHeight (24);
        resultsList.setColour (ListBox::backgroundColourId, Colour (0xFF2a2a2a));
        resultsList.setColour (ListBox::outlineColourId, Colour (0xFF444444));
        addAndMakeVisible (resultsList);
        resultsList.setModel (this);

        setSize (300, 200);
    }

    ~NodeSearchComponent() override
    {
        stopTimer();
    }

    void setGraphEditor (GraphEditorComponent* editor)
    {
        graphEditor = editor;
        updateResults();
    }

    void show()
    {
        setVisible (true);
        searchBox.grabKeyboardFocus();
        searchBox.selectAll();
        updateResults();
        startTimerHz (5);
    }

    void hide()
    {
        setVisible (false);
        stopTimer();
        searchBox.clear();
        searchResults.clear();
        resultsList.updateContent();
    }

    void paint (Graphics& g) override
    {
        g.fillAll (Colour (0xFF1a1a1a));
        g.setColour (Colours::grey);
        g.drawRect (getLocalBounds(), 1);
    }

    void resized() override
    {
        auto r = getLocalBounds().reduced (8);
        searchBox.setBounds (r.removeFromTop (28));
        r.removeFromTop (4);
        resultsList.setBounds (r);
    }

    bool keyPressed (const KeyPress& key) override
    {
        if (key.isKeyCode (KeyPress::escapeKey))
        {
            hide();
            return true;
        }

        if (key.isKeyCode (KeyPress::returnKey))
        {
            selectCurrentResult();
            return true;
        }

        if (key.isKeyCode (KeyPress::downKey))
        {
            int row = resultsList.getSelectedRow();
            if (row < searchResults.size() - 1)
                resultsList.selectRow (row + 1);
            return true;
        }

        if (key.isKeyCode (KeyPress::upKey))
        {
            int row = resultsList.getSelectedRow();
            if (row > 0)
                resultsList.selectRow (row - 1);
            return true;
        }

        return false;
    }

    // ListBoxModel implementation
    int getNumRows() override
    {
        return searchResults.size();
    }

    void paintListBoxItem (int rowNumber, Graphics& g, int width, int height, bool rowIsSelected) override
    {
        if (rowNumber < 0 || rowNumber >= searchResults.size())
            return;

        if (rowIsSelected)
            g.fillAll (Colour (0xFF3a3a5a));
        else if (rowNumber % 2 == 0)
            g.fillAll (Colour (0xFF2a2a2a));
        else
            g.fillAll (Colour (0xFF252525));

        auto* block = searchResults[rowNumber].getComponent();
        if (block == nullptr)
            return;

        // Draw node name
        g.setColour (Colours::white);
        g.setFont (14.0f);
        g.drawText (block->getNode().getDisplayName(),
                    8, 0, width - 16, height,
                    Justification::centredLeft, true);
    }

    void listBoxItemClicked (int row, const MouseEvent&) override
    {
        if (row >= 0 && row < searchResults.size())
        {
            selectResult (row);
        }
    }

    void listBoxItemDoubleClicked (int row, const MouseEvent&) override
    {
        if (row >= 0 && row < searchResults.size())
        {
            selectResult (row);
            hide();
        }
    }

private:
    juce::Component::SafePointer<GraphEditorComponent> graphEditor;
    TextEditor searchBox;
    ListBox resultsList { "searchResults", this };
    juce::Array<juce::Component::SafePointer<BlockComponent>> searchResults;

    void timerCallback() override
    {
        // Auto-hide if focus is lost
        if (! hasKeyboardFocus (true) && ! searchBox.hasKeyboardFocus (true))
        {
            hide();
        }
    }

    void textEditorTextChanged (TextEditor&) override
    {
        updateResults();
    }

    void textEditorReturnKeyPressed (TextEditor&) override
    {
        selectCurrentResult();
    }

    void textEditorEscapeKeyPressed (TextEditor&) override
    {
        hide();
    }

    void updateResults()
    {
        searchResults.clear();

        if (graphEditor == nullptr)
        {
            resultsList.updateContent();
            return;
        }

        String query = searchBox.getText().toLowerCase();

        for (int i = 0; i < graphEditor->getNumChildComponents(); ++i)
        {
            if (auto* block = dynamic_cast<BlockComponent*> (graphEditor->getChildComponent (i)))
            {
                String nodeName = block->getNode().getDisplayName().toLowerCase();
                if (query.isEmpty() || nodeName.contains (query))
                {
                    searchResults.add (block);
                }
            }
        }

        // Sort alphabetically
        std::sort (searchResults.begin(), searchResults.end(),
                   [] (const juce::Component::SafePointer<BlockComponent>& a,
                       const juce::Component::SafePointer<BlockComponent>& b) {
                       if (a == nullptr || b == nullptr)
                           return a != nullptr;
                       return a->getNode().getDisplayName().compareIgnoreCase (
                           b->getNode().getDisplayName()) < 0;
                   });

        resultsList.updateContent();

        if (searchResults.size() > 0)
            resultsList.selectRow (0);
    }

    void selectCurrentResult()
    {
        int row = resultsList.getSelectedRow();
        if (row >= 0 && row < searchResults.size())
        {
            selectResult (row);
            hide();
        }
    }

    void selectResult (int index)
    {
        if (index < 0 || index >= searchResults.size())
            return;

        auto* block = searchResults[index].getComponent();
        if (block == nullptr || graphEditor == nullptr)
            return;

        // Select the node
        auto node = block->getNode();
        graphEditor->selectNode (node);

        // Scroll to make the block visible
        if (auto* parent = graphEditor->findParentComponentOfClass<Viewport>())
        {
            auto blockBounds = block->getBounds();
            int vpX = blockBounds.getCentreX() - parent->getViewWidth() / 2;
            int vpY = blockBounds.getCentreY() - parent->getViewHeight() / 2;
            parent->setViewPosition (vpX, vpY);
        }
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NodeSearchComponent)
};

} // namespace element
