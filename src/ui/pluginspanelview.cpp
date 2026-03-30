// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/plugins.hpp>
#include "ui/guicommon.hpp"
#include "ui/pluginspanelview.hpp"
#include "ui/pluginusagetracker.hpp"

namespace element {

// ── TreeViewItem classes (kept for All mode) ────────────────────────────────

class PluginTreeViewItem : public TreeViewItem
{
public:
    PluginTreeViewItem (const PluginDescription& d)
        : desc (new PluginDescription (d)) {}
    bool mightContainSubItems() override { return false; }
    const std::unique_ptr<const PluginDescription> desc;

    var getDragSourceDescription() override
    {
        var result;
        result.append ("plugin");
        result.append (desc->createIdentifierString());
        return result;
    }

    static String shortFormatName (const String& name)
    {
        if (name == "VST")
            return "vst";
        else if (name == "AudioUnit")
            return "au";
        else if (name == "VST3")
            return "vst3";
        else if (name == "LV2")
            return "lv2";
        else if (name == "CLAP")
            return "clap";
        return String();
    }

    void paintItem (Graphics& g, int width, int height) override
    {
        g.setColour (element::Colors::textColor.darker (0.22f));
        String text = desc->name;
        String extra = shortFormatName (desc->pluginFormatName);

        const int leftSide = (width * 4) / 5;
        g.drawText (text, 0, 0, leftSide, height, Justification::centredLeft);
        if (extra.isNotEmpty())
        {
            g.setColour (element::Colors::textColor.withAlpha (0.8f));
            extra = String ("(") + extra + String (")");
            g.setFont (Font (FontOptions (12.f)));
            g.drawText (extra, leftSide, 0, width - leftSide - 3, height, Justification::centredRight);
        }
    }
};

/** Returns true if the given plugin tree (or any of its sub-folders)
    contains at least one plugin whose name matches the search text. */
static bool folderHasMatchingPlugins (const KnownPluginList::PluginTree& folder,
                                      const String& searchText)
{
    for (const auto& plugin : folder.plugins)
        if (plugin.name.containsIgnoreCase (searchText))
            return true;

    for (const auto* sub : folder.subFolders)
        if (folderHasMatchingPlugins (*sub, searchText))
            return true;

    return false;
}

class PluginFolderTreeViewItem : public TreeViewItem
{
public:
    PluginFolderTreeViewItem (PluginsPanelView& o, KnownPluginList::PluginTree& t)
        : tree (t), panel (o)
    {
    }

    bool mightContainSubItems() override { return true; }
    KnownPluginList::PluginTree& tree;
    PluginsPanelView& panel;
    void paintItem (Graphics& g, int width, int height) override
    {
        g.setColour (element::Colors::textColor);
        g.drawText (tree.folder, 6, 0, width - 6, height, Justification::centredLeft);
    }

    void itemOpennessChanged (bool isNowOpen) override
    {
        if (isNowOpen)
        {
            const auto text = panel.getSearchText();
            for (auto* folder : tree.subFolders)
                if (text.isEmpty() || folderHasMatchingPlugins (*folder, text))
                    addSubItem (new PluginFolderTreeViewItem (panel, *folder));
            for (const auto& plugin : tree.plugins)
                if (text.isEmpty() || plugin.name.containsIgnoreCase (text))
                    addSubItem (new PluginTreeViewItem (plugin));
        }
        else
        {
            clearSubItems();
        }
    }
};

class PluginsPanelTreeRootItem : public TreeViewItem
{
public:
    PluginsPanelTreeRootItem (PluginsPanelView& o, PluginManager& p)
        : owner (o),
          plugins (p)
    {
        data = KnownPluginList::createTree (p.getKnownPlugins().getTypes(),
                                            KnownPluginList::sortByCategory);
    }

    bool mightContainSubItems() override { return true; }

    void itemOpennessChanged (bool isNowOpen) override
    {
        if (isNowOpen)
        {
            const auto text = owner.getSearchText();
            for (auto* folder : data->subFolders)
                if (text.isEmpty() || folderHasMatchingPlugins (*folder, text))
                    addSubItem (new PluginFolderTreeViewItem (owner, *folder));
        }
        else
        {
            clearSubItems();
        }
    }

    PluginsPanelView& owner;
    PluginManager& plugins;

    std::unique_ptr<KnownPluginList::PluginTree> data;
};

// ── Color constants for flat list ───────────────────────────────────────────

namespace ListColors {
    static const Colour rowDefault     { 0xff16191a };
    static const Colour rowHover       { 0xff2a2d2e };
    static const Colour rowSelected    { 0xff4765a0 };
    static const Colour divider        { 0xff2a2d2f };
    static const Colour starOff        { 0xff555555 };
    static const Colour starOffHover   { 0xff8a9099 };
    static const Colour starOn         { 0xff33aaf9 };
    static const Colour starOnHover    { 0xff55bbff };
    static const Colour typeInstrument { 0xff4fc3f7 };
    static const Colour typeEffect     { 0xff81c784 };
    static const Colour typeMidi       { 0xffce93d8 };
    static const Colour badgeBg        { 0xff555555 };
    static const Colour badgeText      { 0xffcccccc };
    static const Colour emptyText      { 0xff888888 };
    static const Colour segDefault     { 0xff3b3b3b };
    static const Colour segHover       { 0xff4a4a4a };
    static const Colour segActive      { 0xff4765a0 };
    static const Colour segBorder      { 0xff555555 };
    static const Colour segTextDefault { 0xffcccccc };
    static const Colour segTextActive  { 0xffffffff };
}

// ── FlatListModel ───────────────────────────────────────────────────────────

class PluginsPanelView::FlatListModel : public ListBoxModel
{
public:
    FlatListModel (PluginsPanelView& owner)
        : panel (owner) {}

    int getNumRows() override { return entries.size(); }

    void paintListBoxItem (int rowNumber, Graphics& g, int width, int height,
                           bool rowIsSelected) override
    {
        if (rowNumber < 0 || rowNumber >= entries.size())
            return;

        const auto& desc = entries.getReference (rowNumber);
        const bool isHovered = (rowNumber == panel.hoveredRow);

        // ── Row background ──
        if (rowIsSelected)
            g.fillAll (ListColors::rowSelected);
        else if (isHovered)
            g.fillAll (ListColors::rowHover);
        else
            g.fillAll (ListColors::rowDefault);

        auto& tracker = panel.plugins.getUsageTracker();
        const bool isFav = tracker.isFavorite (desc);

        // ── Star (x=5, 16x16 area) ──
        {
            static const Path star = [] {
                Path p;
                p.addStar ({ 0.f, 0.f }, 5, 4.f, 7.f);
                return p;
            }();

            auto starBounds = star.getBounds();
            auto transform = AffineTransform::translation (-starBounds.getCentreX(), -starBounds.getCentreY())
                                 .scaled (12.f / starBounds.getWidth(), 12.f / starBounds.getHeight())
                                 .translated (5.f + 6.f, height * 0.5f);

            Colour starColour;
            if (isFav)
                starColour = isHovered ? ListColors::starOnHover : ListColors::starOn;
            else
                starColour = isHovered ? ListColors::starOffHover : ListColors::starOff;

            g.setColour (starColour);
            g.fillPath (star, transform);
        }

        // ── Type dot (8x8 at x=25, y centered) ──
        {
            Colour dotColour = ListColors::typeEffect;
            if (desc.isInstrument)
                dotColour = ListColors::typeInstrument;
            else if (desc.category.containsIgnoreCase ("MIDI"))
                dotColour = ListColors::typeMidi;

            g.setColour (dotColour);
            g.fillEllipse (25.f, (height - 8.f) * 0.5f, 8.f, 8.f);
        }

        // ── Format badge (right-aligned) ──
        const String fmt = PluginTreeViewItem::shortFormatName (desc.pluginFormatName);
        int badgeWidth = 0;
        const int badgeRightMargin = 4;
        if (fmt.isNotEmpty())
        {
            static const Font badgeFont = Font (FontOptions (10.f)).boldened();
            g.setFont (badgeFont);
            int textW = (int) std::ceil (badgeFont.getStringWidthFloat (fmt));
            badgeWidth = textW + 8;
            int badgeX = width - badgeWidth - badgeRightMargin;
            int badgeH = 14;
            int badgeY = (height - badgeH) / 2;

            g.setColour (ListColors::badgeBg);
            g.fillRoundedRectangle ((float) badgeX, (float) badgeY,
                                    (float) badgeWidth, (float) badgeH, 2.f);
            g.setColour (ListColors::badgeText);
            g.drawText (fmt, badgeX, badgeY, badgeWidth, badgeH, Justification::centred);
        }

        // ── Plugin name ──
        {
            const int nameX = 37;
            int nameW = width - nameX - badgeWidth - badgeRightMargin - 4;
            static const Font nameFont (FontOptions (12.f));
            g.setColour (rowIsSelected ? Colours::white : element::Colors::textColor.darker (0.1f));
            g.setFont (nameFont);
            g.drawText (desc.name, nameX, 0, nameW, height, Justification::centredLeft, true);
        }
    }

    void listBoxItemClicked (int row, const MouseEvent& e) override
    {
        if (row < 0 || row >= entries.size())
            return;

        const auto& desc = entries.getReference (row);

        // Star click detection
        if (e.x < 22)
        {
            panel.plugins.getUsageTracker().toggleFavorite (desc);
            panel.flatList.repaint();
            return;
        }

        // Right-click context menu
        if (e.mods.isPopupMenu())
        {
            showContextMenu (row);
        }
    }

    void listBoxItemDoubleClicked (int row, const MouseEvent&) override
    {
        // Double-click does nothing for now; drag-and-drop is the
        // primary way to add plugins to the graph.
        ignoreUnused (row);
    }

    var getDragSourceDescription (const SparseSet<int>& selectedRows) override
    {
        if (selectedRows.size() == 1)
        {
            int row = selectedRows[0];
            if (row >= 0 && row < entries.size())
            {
                var result;
                result.append ("plugin");
                result.append (entries.getReference (row).createIdentifierString());
                return result;
            }
        }
        return {};
    }

    void setEntries (const Array<PluginDescription>& newEntries)
    {
        entries = newEntries;
    }

    bool isEmpty() const { return entries.isEmpty(); }

    Array<PluginDescription> entries;

private:
    PluginsPanelView& panel;

    void showContextMenu (int row)
    {
        if (row < 0 || row >= entries.size())
            return;

        const auto& desc = entries.getReference (row);
        auto& tracker = panel.plugins.getUsageTracker();

        PopupMenu menu;
        if (tracker.isFavorite (desc))
            menu.addItem (1, "Remove from Favorites");
        else
            menu.addItem (1, "Add to Favorites");

        Component::SafePointer<PluginsPanelView> safeThis (&panel);
        menu.showMenuAsync (PopupMenu::Options(), [safeThis, desc] (int result)
        {
            if (result == 1 && safeThis != nullptr)
                safeThis->plugins.getUsageTracker().toggleFavorite (desc);
        });
    }
};

// ── PluginsPanelView implementation ─────────────────────────────────────────

PluginsPanelView::PluginsPanelView (PluginManager& p)
    : plugins (p)
{
    // Search box
    addAndMakeVisible (search);
    search.setTextToShowWhenEmpty (TRANS ("Search plugins..."), Colors::textColor.darker());
    search.addListener (this);

    // TreeView (for All mode)
    addAndMakeVisible (tree);
    tree.setRootItemVisible (false);
    tree.setOpenCloseButtonsVisible (true);
    tree.setIndentSize (10);
    tree.setRootItem (new PluginsPanelTreeRootItem (*this, plugins));

    // Flat list (for search / favorites / recent modes)
    flatListModel = std::make_unique<FlatListModel> (*this);
    flatList.setModel (flatListModel.get());
    flatList.setRowHeight (28);
    flatList.setColour (ListBox::backgroundColourId, ListColors::rowDefault);
    flatList.setMultipleSelectionEnabled (false);
    addChildComponent (flatList);

    // Mouse move tracking for hover effects on flat list
    flatList.addMouseListener (this, true);

    // Segmented control buttons
    addAndMakeVisible (btnAll);
    addAndMakeVisible (btnFavorites);
    addAndMakeVisible (btnRecent);

    auto setupButton = [this] (TextButton& btn, ViewMode mode)
    {
        btn.setClickingTogglesState (false);
        btn.onClick = [this, mode]() { setViewMode (mode); };
    };

    setupButton (btnAll, ViewMode::All);
    setupButton (btnFavorites, ViewMode::Favorites);
    setupButton (btnRecent, ViewMode::Recent);

    updateSegmentButtons();

    // Listen for changes
    plugins.getKnownPlugins().addChangeListener (this);
    plugins.getUsageTracker().addChangeListener (this);
}

PluginsPanelView::~PluginsPanelView()
{
    flatList.removeMouseListener (this);
    plugins.getUsageTracker().removeChangeListener (this);
    plugins.getKnownPlugins().removeChangeListener (this);
    flatList.setModel (nullptr);
    if (auto* root = tree.getRootItem())
        root->clearSubItems();
    tree.deleteRootItem();
}

void PluginsPanelView::resized()
{
    auto r = getLocalBounds().reduced (2);
    search.setBounds (r.removeFromTop (22));
    r.removeFromTop (4);

    // Segmented control area
    auto segArea = r.removeFromTop (20);
    int segW = segArea.getWidth() / 3;
    btnAll.setBounds (segArea.removeFromLeft (segW));
    btnFavorites.setBounds (segArea.removeFromLeft (segW));
    btnRecent.setBounds (segArea);

    r.removeFromTop (4);

    // Content area
    tree.setBounds (r);
    flatList.setBounds (r);
}

void PluginsPanelView::paint (Graphics& g)
{
    // Divider line between segmented control and content
    auto r = getLocalBounds().reduced (2);
    int dividerY = 22 + 4 + 20 + 2;
    g.setColour (ListColors::divider);
    g.drawHorizontalLine (dividerY, (float) r.getX(), (float) r.getRight());

    // Empty state text when flat list is visible and empty
    if (flatList.isVisible() && flatListModel->isEmpty())
    {
        auto contentArea = getLocalBounds().reduced (2);
        contentArea.removeFromTop (22 + 4 + 20 + 4);

        g.setColour (ListColors::emptyText);
        g.setFont (Font (FontOptions (14.f)));

        String emptyText;
        switch (viewMode)
        {
            case ViewMode::All:
                emptyText = "No plugins found.";
                break;
            case ViewMode::Favorites:
                emptyText = "No favorites yet.\nRight-click a plugin to add.";
                break;
            case ViewMode::Recent:
                emptyText = "No recently used plugins.";
                break;
        }

        g.drawFittedText (emptyText, contentArea, Justification::centred, 2);
    }
}

void PluginsPanelView::setViewMode (ViewMode mode)
{
    if (viewMode == mode)
        return;
    viewMode = mode;
    updateSegmentButtons();
    refreshContent();
}

void PluginsPanelView::updateSegmentButtons()
{
    styleSegmentButton (btnAll, viewMode == ViewMode::All);
    styleSegmentButton (btnFavorites, viewMode == ViewMode::Favorites);
    styleSegmentButton (btnRecent, viewMode == ViewMode::Recent);
}

void PluginsPanelView::styleSegmentButton (TextButton& btn, bool active)
{
    btn.setColour (TextButton::buttonColourId,
                   active ? ListColors::segActive : ListColors::segDefault);
    btn.setColour (TextButton::buttonOnColourId, ListColors::segActive);
    btn.setColour (TextButton::textColourOffId,
                   active ? ListColors::segTextActive : ListColors::segTextDefault);
    btn.setColour (TextButton::textColourOnId, ListColors::segTextActive);

    auto f = Font (FontOptions (12.f));
    if (active)
        f = f.boldened();
    btn.setLookAndFeel (nullptr); // use default
}

void PluginsPanelView::refreshContent()
{
    const auto searchText = search.getText();
    const bool hasSearch = searchText.isNotEmpty();

    if (viewMode == ViewMode::All && ! hasSearch)
    {
        // Show the tree view (existing category browsing)
        tree.setVisible (true);
        flatList.setVisible (false);
        updateTreeView();
        repaint();
        return;
    }

    // All other cases use the flat list
    tree.setVisible (false);
    flatList.setVisible (true);

    Array<PluginDescription> results;

    if (viewMode == ViewMode::Favorites)
    {
        results = plugins.getUsageTracker().getFavorites();
    }
    else if (viewMode == ViewMode::Recent)
    {
        results = plugins.getUsageTracker().getRecentlyUsed (10);
    }
    else
    {
        // All mode with search text
        const auto& types = plugins.getKnownPlugins().getTypes();
        for (const auto& desc : types)
            results.add (desc);
    }

    // Apply search filter
    if (hasSearch)
    {
        Array<PluginDescription> filtered;
        for (const auto& desc : results)
            if (desc.name.containsIgnoreCase (searchText))
                filtered.add (desc);
        results = filtered;
    }

    flatListModel->setEntries (results);
    flatList.updateContent();
    flatList.repaint();
    repaint();
}

void PluginsPanelView::updateTreeView()
{
    tree.deleteRootItem();
    tree.setRootItem (new PluginsPanelTreeRootItem (*this, plugins));
    auto* root = tree.getRootItem();
    for (int i = 0; i < root->getNumSubItems(); ++i)
        root->getSubItem (i)->setOpenness (TreeViewItem::Openness::opennessOpen);
}

void PluginsPanelView::textEditorTextChanged (TextEditor&)
{
    startTimer (200);
}

void PluginsPanelView::timerCallback()
{
    refreshContent();
    stopTimer();
}

void PluginsPanelView::textEditorReturnKeyPressed (TextEditor&)
{
    stopTimer();
    refreshContent();
}

void PluginsPanelView::changeListenerCallback (ChangeBroadcaster*)
{
    refreshContent();
}

void PluginsPanelView::mouseMove (const MouseEvent& e)
{
    if (flatList.isVisible())
    {
        auto localPos = flatList.getLocalPoint (this, e.position).roundToInt();
        int row = flatList.getRowContainingPosition (localPos.x, localPos.y);
        if (row != hoveredRow)
        {
            hoveredRow = row;
            flatList.repaint();
        }
    }
}

void PluginsPanelView::mouseExit (const MouseEvent&)
{
    if (hoveredRow != -1)
    {
        hoveredRow = -1;
        flatList.repaint();
    }
}

} // namespace element
