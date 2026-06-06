// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include "ElementApp.h"
#include <element/plugins.hpp>
#include "messages.hpp"
#include "ui/viewhelpers.hpp"

namespace element {

class GraphEditorComponent;

/** An inline search popup for quickly adding plugins to the graph.
    Appears at the mouse position on right-click (empty canvas).
    Type to filter, Enter to insert at cursor position. */
class QuickAddComponent : public Component,
                          public ListBoxModel,
                          private TextEditor::Listener,
                          private Timer
{
public:
    explicit QuickAddComponent (PluginManager& pm)
        : plugins (pm)
    {
        setOpaque (true);

        searchBox.setMultiLine (false);
        searchBox.setReturnKeyStartsNewLine (false);
        searchBox.setPopupMenuEnabled (false);
        searchBox.setScrollbarsShown (false);
        searchBox.setColour (TextEditor::backgroundColourId, juce::Colour (0xFF222528));
        searchBox.setColour (TextEditor::outlineColourId, juce::Colour (0xFF444444));
        searchBox.setColour (TextEditor::focusedOutlineColourId, juce::Colour (0xFF4765a0));
        searchBox.setColour (TextEditor::textColourId, juce::Colours::white);
        searchBox.setTextToShowWhenEmpty ("Add block...", juce::Colours::grey);
        searchBox.addListener (this);
        addAndMakeVisible (searchBox);

        resultsList.setRowHeight (28);
        resultsList.setColour (ListBox::backgroundColourId, juce::Colour (0xFF1e2123));
        resultsList.setColour (ListBox::outlineColourId, juce::Colours::transparentBlack);
        addAndMakeVisible (resultsList);
        resultsList.setModel (this);

        setSize (280, 280);
        setVisible (false);
    }

    ~QuickAddComponent() override { stopTimer(); }

    /** Show the popup at the given position (relative to parent). */
    void showAt (juce::Point<int> position, const Node& currentGraph)
    {
        graph = currentGraph;
        insertPosition = position;
        refreshPluginList();
        updateResults();

        // Position and clamp to parent bounds
        int x = position.x - getWidth() / 2;
        int y = position.y;
        if (auto* parent = getParentComponent())
        {
            x = juce::jmax (0, juce::jmin (x, parent->getWidth() - getWidth()));
            y = juce::jmax (0, juce::jmin (y, parent->getHeight() - getHeight()));
        }
        setTopLeftPosition (x, y);

        setVisible (true);
        toFront (true);
        searchBox.clear();
        searchBox.grabKeyboardFocus();
        startTimerHz (5);
    }

    /** Hide the popup. */
    void dismiss()
    {
        stopTimer();
        setVisible (false);
        searchBox.clear();
    }

    // === ListBoxModel ===
    int getNumRows() override { return filteredResults.size(); }

    void paintListBoxItem (int row, Graphics& g, int width, int height, bool selected) override
    {
        if (row < 0 || row >= filteredResults.size())
            return;

        const auto& desc = filteredResults.getReference (row);

        // Background
        if (selected)
            g.fillAll (juce::Colour (0xFF4765a0));
        else if (row == highlightedRow)
            g.fillAll (juce::Colour (0xFF2a2d2e));
        else
            g.fillAll (row % 2 == 0 ? juce::Colour (0xFF1e2123) : juce::Colour (0xFF1a1c1e));

        // Type dot
        juce::Colour dotColour (0xff81c784); // effect (green)
        if (desc.isInstrument)
            dotColour = juce::Colour (0xff4fc3f7); // instrument (blue)
        else if (desc.category.containsIgnoreCase ("MIDI"))
            dotColour = juce::Colour (0xffce93d8); // MIDI (purple)

        g.setColour (dotColour);
        g.fillEllipse (6.0f, (height - 6.0f) * 0.5f, 6.0f, 6.0f);

        // Plugin name
        const int nameX = 16;
        g.setColour (selected ? juce::Colours::white : juce::Colour (0xffcccccc));
        g.setFont (Font (FontOptions (12.f)));

        // Measure name width for manufacturer placement
        juce::String displayName = desc.name;
        int nameTextW = g.getCurrentFont().getStringWidth (displayName);

        // Format badge
        juce::String fmt;
        if (desc.pluginFormatName == "VST") fmt = "vst";
        else if (desc.pluginFormatName == "AudioUnit") fmt = "au";
        else if (desc.pluginFormatName == "VST3") fmt = "vst3";
        else if (desc.pluginFormatName == "LV2") fmt = "lv2";
        else if (desc.pluginFormatName == "CLAP") fmt = "clap";

        int badgeW = 0;
        if (fmt.isNotEmpty())
        {
            auto badgeFont = Font (FontOptions (9.f)).boldened();
            badgeW = badgeFont.getStringWidth (fmt) + 8;
        }

        // Name + manufacturer
        int availW = width - nameX - badgeW - 8;
        g.drawText (displayName, nameX, 0, juce::jmin (nameTextW, availW), height,
                    juce::Justification::centredLeft, true);

        // Manufacturer in grey after name
        if (desc.manufacturerName.isNotEmpty())
        {
            int mfgX = nameX + juce::jmin (nameTextW, availW - 60) + 4;
            int mfgW = availW - (mfgX - nameX);
            if (mfgW > 20)
            {
                g.setColour (selected ? juce::Colour (0xffbbbbbb) : juce::Colour (0xff888888));
                g.setFont (Font (FontOptions (10.f)));
                g.drawText (desc.manufacturerName, mfgX, 0, mfgW, height,
                            juce::Justification::centredLeft, true);
            }
        }

        // Format badge (right-aligned)
        if (fmt.isNotEmpty())
        {
            auto badgeFont = Font (FontOptions (9.f)).boldened();
            int badgeX = width - badgeW - 4;
            int badgeH = 14;
            int badgeY = (height - badgeH) / 2;
            g.setColour (juce::Colour (0xff555555));
            g.fillRoundedRectangle ((float) badgeX, (float) badgeY, (float) badgeW, (float) badgeH, 2.f);
            g.setColour (juce::Colours::white);
            g.setFont (badgeFont);
            g.drawText (fmt, badgeX, badgeY, badgeW, badgeH, juce::Justification::centred);
        }
    }

    void listBoxItemDoubleClicked (int row, const MouseEvent&) override
    {
        insertSelectedPlugin (row);
    }

    void selectedRowsChanged (int lastRowSelected) override
    {
        highlightedRow = lastRowSelected;
    }

    // === Component ===
    void paint (Graphics& g) override
    {
        g.fillAll (juce::Colour (0xFF1e2123));

        // Border
        g.setColour (juce::Colour (0xFF444444));
        g.drawRect (getLocalBounds(), 1);

        // Shadow effect (simple darkened edge)
        g.setColour (juce::Colour (0x40000000));
        g.drawRect (getLocalBounds().expanded (1), 1);
    }

    void resized() override
    {
        auto r = getLocalBounds().reduced (1);
        searchBox.setBounds (r.removeFromTop (28).reduced (4, 4));
        resultsList.setBounds (r.reduced (2, 2));
    }

    bool keyPressed (const KeyPress& key) override
    {
        if (key == KeyPress::escapeKey)
        {
            dismiss();
            return true;
        }

        if (key == KeyPress::returnKey)
        {
            int selected = resultsList.getSelectedRow();
            if (selected < 0 && filteredResults.size() > 0)
                selected = 0;
            insertSelectedPlugin (selected);
            return true;
        }

        if (key == KeyPress::downKey)
        {
            int next = juce::jmin (resultsList.getSelectedRow() + 1, filteredResults.size() - 1);
            resultsList.selectRow (next);
            return true;
        }

        if (key == KeyPress::upKey)
        {
            int prev = juce::jmax (resultsList.getSelectedRow() - 1, 0);
            resultsList.selectRow (prev);
            return true;
        }

        return false;
    }

private:
    PluginManager& plugins;
    Node graph;
    juce::Point<int> insertPosition;
    juce::Array<PluginDescription> allPlugins;
    juce::Array<PluginDescription> filteredResults;
    TextEditor searchBox;
    ListBox resultsList { "quickAddResults", this };
    int highlightedRow = -1;

    void refreshPluginList()
    {
        allPlugins.clear();
        const auto& types = plugins.getKnownPlugins().getTypes();
        for (const auto& desc : types)
            allPlugins.add (desc);

        // Sort by name
        std::sort (allPlugins.begin(), allPlugins.end(),
                   [] (const PluginDescription& a, const PluginDescription& b) {
                       return a.name.compareIgnoreCase (b.name) < 0;
                   });
    }

    void updateResults()
    {
        const auto query = searchBox.getText().trim();
        filteredResults.clear();

        for (const auto& desc : allPlugins)
        {
            if (query.isEmpty()
                || desc.name.containsIgnoreCase (query)
                || desc.manufacturerName.containsIgnoreCase (query))
            {
                filteredResults.add (desc);
            }
        }

        resultsList.updateContent();
        if (filteredResults.size() > 0)
            resultsList.selectRow (0);
        resultsList.repaint();
    }

    void insertSelectedPlugin (int row)
    {
        if (row < 0 || row >= filteredResults.size())
            return;

        const auto& desc = filteredResults.getReference (row);
        if (desc.fileOrIdentifier.isNotEmpty() && desc.pluginFormatName.isNotEmpty())
        {
            ViewHelpers::postMessageFor (this, new AddPluginMessage (graph, desc, true));
        }
        dismiss();
    }

    // TextEditor::Listener
    void textEditorTextChanged (TextEditor&) override { updateResults(); }

    void textEditorReturnKeyPressed (TextEditor&) override
    {
        int selected = resultsList.getSelectedRow();
        if (selected < 0 && filteredResults.size() > 0)
            selected = 0;
        insertSelectedPlugin (selected);
    }

    void textEditorEscapeKeyPressed (TextEditor&) override { dismiss(); }

    // Timer — auto-dismiss on focus loss
    void timerCallback() override
    {
        if (! hasKeyboardFocus (true) && ! searchBox.hasKeyboardFocus (true))
            dismiss();
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (QuickAddComponent)
};

} // namespace element
