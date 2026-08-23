# Phase A: Plugin Browser Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add favorites, recently used, type/format badges to the plugin browser panel

**Architecture:** Move `PluginUsageTracker` ownership into `PluginManager` (gives it `KnownPluginList` access). Add a segmented view selector (All/Favorites/Recent) to `PluginsPanelView`. Enhance row painting with star toggle, type indicator dot, and format badge. Timer-coalesce saves to avoid blocking the message thread.

**Tech Stack:** C++20, JUCE 8.0.12, `KnownPluginList`, `ListBoxModel`, `TreeView`, `ValueTree` XML persistence

**Design spec:** `docs/plans/2026-03-30-ui-ux-design.md` Section A

---

## File Structure

| File | Responsibility | Operation |
|------|---------------|-----------|
| `src/ui/pluginusagetracker.hpp` | `PluginUsageTracker` class (extracted from moleculemanager) | Create |
| `src/ui/pluginusagetracker.cpp` | Implementation + timer-coalesced save | Create |
| `include/element/plugins.hpp` | `PluginManager` public API: add `getUsageTracker()` | Modify |
| `src/pluginmanager.cpp` | `PluginManager::Private`: own tracker, pass `KnownPluginList&` | Modify |
| `src/ui/moleculemanager.hpp` | Remove `PluginUsageTracker` (moved to own file) | Modify |
| `src/ui/moleculemanager.cpp` | Remove `PluginUsageTracker` implementation | Modify |
| `src/ui/pluginspanelview.hpp` | Expanded class: segmented control, viewport, flat list model | Modify |
| `src/ui/pluginspanelview.cpp` | Rewritten panel: favorites/recent/all views, row painting | Modify |

---

### Task 1: Extract PluginUsageTracker to its own header

**Files:**
- Create: `src/ui/pluginusagetracker.hpp`
- Create: `src/ui/pluginusagetracker.cpp`
- Modify: `src/ui/moleculemanager.hpp` (remove PluginUsageTracker class)
- Modify: `src/ui/moleculemanager.cpp` (remove PluginUsageTracker implementation)

- [ ] **Step 1: Create `src/ui/pluginusagetracker.hpp`**

Copy the `PluginUsageTracker` class from `moleculemanager.hpp:109-164` into a new file. Add a `KnownPluginList&` constructor parameter and make it a `ChangeBroadcaster` so the UI can listen for changes. Add timer-coalesced saves.

```cpp
// src/ui/pluginusagetracker.hpp
// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/audio_processors.hpp>

namespace element {

/** Tracks plugin usage for favorites and recently used features.
    Owns no KnownPluginList — receives a reference at construction.
    Broadcasts changes so UI listeners can refresh. */
class PluginUsageTracker : public juce::ChangeBroadcaster,
                           private juce::Timer
{
public:
    explicit PluginUsageTracker (juce::KnownPluginList& knownPlugins);
    ~PluginUsageTracker() override;

    void recordUsage (const juce::PluginDescription& desc);
    void toggleFavorite (const juce::PluginDescription& desc);
    bool isFavorite (const juce::PluginDescription& desc) const;

    juce::Array<juce::PluginDescription> getFavorites() const;
    juce::Array<juce::PluginDescription> getRecentlyUsed (int maxItems = 10) const;
    juce::StringArray getRecentlyUsedIdentifiers (int maxItems = 10) const;
    bool isRecentlyUsed (const juce::PluginDescription& desc) const;
    const juce::StringArray& getFavoriteIdentifiers() const { return favoriteIdentifiers; }

    void save();
    void load();
    void clearRecentlyUsed();

private:
    struct UsageEntry
    {
        juce::String pluginIdentifier;
        juce::Time lastUsed;
        int useCount { 0 };
    };

    juce::KnownPluginList& knownPlugins;
    juce::Array<UsageEntry> recentlyUsed;
    juce::StringArray favoriteIdentifiers;
    juce::File settingsFile;
    bool savePending = false;

    int findEntry (const juce::String& identifier) const;
    void scheduleSave();
    void timerCallback() override;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginUsageTracker)
};

} // namespace element
```

- [ ] **Step 2: Create `src/ui/pluginusagetracker.cpp`**

Move the implementation from `moleculemanager.cpp:278-456`. Key changes: accept `KnownPluginList&` in constructor, implement `getFavorites()` and `getRecentlyUsed()` by resolving identifiers against the list, add timer-coalesced saves, broadcast changes.

```cpp
// src/ui/pluginusagetracker.cpp
// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include "ui/pluginusagetracker.hpp"

namespace element {
using namespace juce;

PluginUsageTracker::PluginUsageTracker (KnownPluginList& kpl)
    : knownPlugins (kpl)
{
    settingsFile = File::getSpecialLocation (File::userApplicationDataDirectory)
                       .getChildFile ("Element")
                       .getChildFile ("plugin_usage.xml");
    load();
}

PluginUsageTracker::~PluginUsageTracker()
{
    stopTimer();
    if (savePending)
        save();
}

void PluginUsageTracker::recordUsage (const PluginDescription& desc)
{
    jassert (MessageManager::existsAndIsCurrentThread());

    String identifier = desc.createIdentifierString();
    int index = findEntry (identifier);

    if (index >= 0)
    {
        recentlyUsed.getReference (index).lastUsed = Time::getCurrentTime();
        recentlyUsed.getReference (index).useCount++;
        auto entry = recentlyUsed[index];
        recentlyUsed.remove (index);
        recentlyUsed.insert (0, entry);
    }
    else
    {
        UsageEntry entry;
        entry.pluginIdentifier = identifier;
        entry.lastUsed = Time::getCurrentTime();
        entry.useCount = 1;
        recentlyUsed.insert (0, entry);
    }

    while (recentlyUsed.size() > 50)
        recentlyUsed.removeLast();

    scheduleSave();
    sendChangeMessage();
}

void PluginUsageTracker::toggleFavorite (const PluginDescription& desc)
{
    jassert (MessageManager::existsAndIsCurrentThread());

    String identifier = desc.createIdentifierString();

    if (favoriteIdentifiers.contains (identifier))
        favoriteIdentifiers.removeString (identifier);
    else
        favoriteIdentifiers.add (identifier);

    scheduleSave();
    sendChangeMessage();
}

bool PluginUsageTracker::isFavorite (const PluginDescription& desc) const
{
    return favoriteIdentifiers.contains (desc.createIdentifierString());
}

Array<PluginDescription> PluginUsageTracker::getFavorites() const
{
    Array<PluginDescription> results;
    const auto& types = knownPlugins.getTypes();

    for (const auto& id : favoriteIdentifiers)
    {
        for (const auto& type : types)
        {
            if (type.createIdentifierString() == id)
            {
                results.add (type);
                break;
            }
        }
    }

    return results;
}

Array<PluginDescription> PluginUsageTracker::getRecentlyUsed (int maxItems) const
{
    Array<PluginDescription> results;
    const auto& types = knownPlugins.getTypes();

    for (int i = 0; i < jmin (maxItems, recentlyUsed.size()); ++i)
    {
        const auto& id = recentlyUsed[i].pluginIdentifier;
        for (const auto& type : types)
        {
            if (type.createIdentifierString() == id)
            {
                results.add (type);
                break;
            }
        }
    }

    return results;
}

StringArray PluginUsageTracker::getRecentlyUsedIdentifiers (int maxItems) const
{
    StringArray identifiers;
    for (int i = 0; i < jmin (maxItems, recentlyUsed.size()); ++i)
        identifiers.add (recentlyUsed[i].pluginIdentifier);
    return identifiers;
}

bool PluginUsageTracker::isRecentlyUsed (const PluginDescription& desc) const
{
    return findEntry (desc.createIdentifierString()) >= 0;
}

void PluginUsageTracker::scheduleSave()
{
    savePending = true;
    startTimer (2000); // coalesce writes — 2s delay
}

void PluginUsageTracker::timerCallback()
{
    stopTimer();
    if (savePending)
        save();
}

void PluginUsageTracker::save()
{
    savePending = false;

    ValueTree data ("PluginUsage");

    ValueTree recentData ("RecentlyUsed");
    for (auto& entry : recentlyUsed)
    {
        ValueTree entryData ("Entry");
        entryData.setProperty ("identifier", entry.pluginIdentifier, nullptr);
        entryData.setProperty ("lastUsed", entry.lastUsed.toMilliseconds(), nullptr);
        entryData.setProperty ("useCount", entry.useCount, nullptr);
        recentData.appendChild (entryData, nullptr);
    }
    data.appendChild (recentData, nullptr);

    ValueTree favData ("Favorites");
    for (auto& fav : favoriteIdentifiers)
    {
        ValueTree favEntry ("Favorite");
        favEntry.setProperty ("identifier", fav, nullptr);
        favData.appendChild (favEntry, nullptr);
    }
    data.appendChild (favData, nullptr);

    if (auto xml = data.createXml())
    {
        settingsFile.getParentDirectory().createDirectory();
        xml->writeTo (settingsFile);
    }
}

void PluginUsageTracker::load()
{
    recentlyUsed.clear();
    favoriteIdentifiers.clear();

    if (! settingsFile.existsAsFile())
        return;

    if (auto xml = XmlDocument::parse (settingsFile))
    {
        auto data = ValueTree::fromXml (*xml);

        auto recentData = data.getChildWithName ("RecentlyUsed");
        for (int i = 0; i < recentData.getNumChildren(); ++i)
        {
            auto entryData = recentData.getChild (i);
            UsageEntry entry;
            entry.pluginIdentifier = entryData.getProperty ("identifier").toString();
            entry.lastUsed = Time (static_cast<int64> (entryData.getProperty ("lastUsed")));
            entry.useCount = entryData.getProperty ("useCount", 1);
            recentlyUsed.add (entry);
        }

        auto favData = data.getChildWithName ("Favorites");
        for (int i = 0; i < favData.getNumChildren(); ++i)
        {
            auto favEntry = favData.getChild (i);
            favoriteIdentifiers.add (favEntry.getProperty ("identifier").toString());
        }
    }
}

void PluginUsageTracker::clearRecentlyUsed()
{
    recentlyUsed.clear();
    scheduleSave();
    sendChangeMessage();
}

int PluginUsageTracker::findEntry (const String& identifier) const
{
    for (int i = 0; i < recentlyUsed.size(); ++i)
        if (recentlyUsed[i].pluginIdentifier == identifier)
            return i;
    return -1;
}

} // namespace element
```

- [ ] **Step 3: Remove PluginUsageTracker from moleculemanager files**

In `src/ui/moleculemanager.hpp`, delete the entire `PluginUsageTracker` class (lines 109-164). Keep `Molecule` and `MoleculeLibrary`.

In `src/ui/moleculemanager.cpp`, delete the entire `PluginUsageTracker` implementation section (lines 274-456). Keep `Molecule` and `MoleculeLibrary` implementations.

- [ ] **Step 4: Add new source to CMakeLists**

Check if the CMake build already globs `src/ui/*.cpp`. If not, add `src/ui/pluginusagetracker.cpp` to the source list.

Run: `grep -n "pluginspanelview\|src/ui" src/CMakeLists.txt | head -5`

- [ ] **Step 5: Build to verify extraction compiles**

Run: `cmake --build build-merged -j8 2>&1 | tail -20`
Expected: Build succeeds (nothing references `PluginUsageTracker` from `moleculemanager.hpp` yet except `GraphEditorComponent` — check and update that include if needed)

- [ ] **Step 6: Commit**

```bash
git add src/ui/pluginusagetracker.hpp src/ui/pluginusagetracker.cpp src/ui/moleculemanager.hpp src/ui/moleculemanager.cpp
git commit -m "refactor: extract PluginUsageTracker to own file with KnownPluginList access"
```

---

### Task 2: Wire PluginUsageTracker into PluginManager

**Files:**
- Modify: `include/element/plugins.hpp`
- Modify: `src/pluginmanager.cpp`

- [ ] **Step 1: Forward-declare and add accessor in plugins.hpp**

In `include/element/plugins.hpp`, add forward declaration before the class and a public accessor:

After line 19 (`class SandboxedProcessorNode;`), add:
```cpp
class PluginUsageTracker;
```

After line 36 (`const juce::KnownPluginList& getKnownPlugins() const;`), add:
```cpp
    /** Access the plugin usage tracker (favorites, recently used) */
    PluginUsageTracker& getUsageTracker();
```

- [ ] **Step 2: Add PluginUsageTracker member to PluginManager::Private**

In `src/pluginmanager.cpp`, add include at the top (after other includes):
```cpp
#include "ui/pluginusagetracker.hpp"
```

In `PluginManager::Private` (line 638), add member after `hasAddedFormats`:
```cpp
    std::unique_ptr<PluginUsageTracker> usageTracker;
```

In the `Private` constructor (line 641), after the `deadAudioPlugins` init, add:
```cpp
        usageTracker = std::make_unique<PluginUsageTracker> (allPlugins);
```

- [ ] **Step 3: Implement getUsageTracker()**

Find the `PluginManager` method implementations section in `pluginmanager.cpp`. Add:

```cpp
PluginUsageTracker& PluginManager::getUsageTracker()
{
    return *priv->usageTracker;
}
```

- [ ] **Step 4: Build and test**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest -R PluginManager --output-on-failure 2>&1 | tail -10`
Expected: Build succeeds, PluginManagerTests pass

- [ ] **Step 5: Commit**

```bash
git add include/element/plugins.hpp src/pluginmanager.cpp
git commit -m "feat: wire PluginUsageTracker into PluginManager with KnownPluginList access"
```

---

### Task 3: Add segmented view selector to PluginsPanelView

**Files:**
- Modify: `src/ui/pluginspanelview.hpp`
- Modify: `src/ui/pluginspanelview.cpp`

- [ ] **Step 1: Update header with new members**

Replace the contents of `src/ui/pluginspanelview.hpp`:

```cpp
// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/ui/content.hpp>

namespace element {

class PluginManager;
class PluginUsageTracker;

class PluginsPanelView : public ContentView,
                         public juce::ChangeListener,
                         public juce::TextEditor::Listener,
                         public juce::Timer
{
public:
    PluginsPanelView (PluginManager& pm);
    ~PluginsPanelView() override;

    void resized() override;
    void paint (juce::Graphics&) override;

    juce::String getSearchText() { return search.getText(); }

    enum class ViewMode { All, Favorites, Recent };
    ViewMode getViewMode() const { return viewMode; }

    void textEditorTextChanged (juce::TextEditor&) override;
    void textEditorReturnKeyPressed (juce::TextEditor&) override;
    void changeListenerCallback (juce::ChangeBroadcaster*) override;
    void timerCallback() override;

private:
    PluginManager& plugins;

    // Search
    juce::TextEditor search;

    // View selector (All / Favorites / Recent)
    juce::TextButton btnAll { "All" };
    juce::TextButton btnFavorites { "Favorites" };
    juce::TextButton btnRecent { "Recent" };
    ViewMode viewMode = ViewMode::All;

    // Tree view (All mode, no search)
    juce::TreeView tree;

    // Flat list (Favorites, Recent, or search results)
    juce::ListBox flatList;
    class FlatListModel;
    std::unique_ptr<FlatListModel> flatModel;

    void setViewMode (ViewMode mode);
    void updateTreeView();
    void updateFlatList();
    void refreshContent();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginsPanelView)
};

} // namespace element
```

- [ ] **Step 2: Implement segmented control and view switching in pluginspanelview.cpp**

This is the largest step. The full rewrite of `pluginspanelview.cpp` includes:
- Segmented control with 3 buttons (styling per design tokens)
- `FlatListModel` inner class for favorites/recent/search views
- Row painting: star toggle, type dot, name, format badge
- View mode switching logic
- Right-click context menu for star toggle

The file is too large to include inline here. Key implementation points:

**FlatListModel** — implements `ListBoxModel`:
- `getNumRows()`: returns `entries.size()`
- `paintListBoxItem()`: draws star (x=5), type dot (x=25), name (x=37), format badge (right-aligned), all per design spec colors
- `listBoxItemClicked()`: check `e.x < 22` for star toggle, `e.mods.isPopupMenu()` for context menu
- `listBoxItemDoubleClicked()`: create drag description for plugin insertion

**View switching:**
- All mode + no search → show `tree`, hide `flatList`
- All mode + search text → show `flatList` with filtered plugins from `KnownPluginList`
- Favorites mode → show `flatList` with `tracker.getFavorites()` filtered by search
- Recent mode → show `flatList` with `tracker.getRecentlyUsed(10)` filtered by search

**Star toggle paint:**
```cpp
// Inside paintListBoxItem, at x=5, y=6, 16x16 area:
Path star;
star.addStar ({8.f, 8.f}, 5, 4.f, 7.f);
g.setColour (isFav ? Colour(0xff33aaf9) : Colour(0xff555555));
g.fillPath (star, AffineTransform::translation (5.f, 6.f));
```

**Type dot paint:**
```cpp
Colour typeColour = desc.isInstrument ? Colour(0xff4fc3f7)
    : desc.category.containsIgnoreCase("MIDI") ? Colour(0xffce93d8)
    : Colour(0xff81c784);
g.setColour (typeColour);
g.fillEllipse (25.f, 10.f, 8.f, 8.f);
```

**Format badge paint:**
```cpp
String fmt = PluginTreeViewItem::shortFormatName (desc.pluginFormatName);
if (fmt.isNotEmpty())
{
    g.setFont (Font (FontOptions (10.f, Font::bold)));
    int badgeW = g.getCurrentFont().getStringWidth (fmt) + 8;
    int badgeX = w - badgeW - 4;
    g.setColour (Colour (0xff555555));
    g.fillRoundedRectangle ((float) badgeX, 7.f, (float) badgeW, 14.f, 2.f);
    g.setColour (Colour (0xffcccccc));
    g.drawText (fmt, badgeX, 7, badgeW, 14, Justification::centred);
}
```

- [ ] **Step 3: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/ui/pluginspanelview.hpp src/ui/pluginspanelview.cpp
git commit -m "feat: plugin browser with favorites, recently used, type badges, and format labels"
```

---

### Task 4: Update GraphEditorComponent to use new tracker include

**Files:**
- Modify: `src/ui/grapheditorcomponent.hpp` (if it includes moleculemanager.hpp for PluginUsageTracker)

- [ ] **Step 1: Check and fix any broken includes**

Run: `grep -rn "moleculemanager" src/ui/ include/ | grep -v ".cpp:" | head -10`

If any header includes `moleculemanager.hpp` specifically for `PluginUsageTracker`, change it to include `pluginusagetracker.hpp`. The `grapheditorcomponent.hpp` includes `moleculemanager.hpp` for `MoleculeLibrary` — that's fine, keep it.

- [ ] **Step 2: Full build and test suite**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -10`
Expected: All 33 tests pass

- [ ] **Step 3: Commit if any changes were needed**

```bash
git add -u
git commit -m "fix: update includes after PluginUsageTracker extraction"
```

---

### Task 5: Verify gate criteria

- [ ] **Step 1: Manual verification checklist**

Launch Element: `open build-merged/element_app_artefacts/Element.app`

Verify:
- [ ] Plugin browser shows 3-segment view selector (All / Favorites / Recent)
- [ ] "All" view shows category TreeView when search is empty
- [ ] Typing in search shows flat filtered list
- [ ] Star toggle on a plugin marks it as favorite
- [ ] Switching to "Favorites" view shows starred plugins
- [ ] Switching to "Recent" view shows recently used plugins
- [ ] Quit and relaunch: favorites and recent persist
- [ ] Type dots show correct colors (blue for instruments, green for effects)
- [ ] Format badges show (au), (vst3), etc.

- [ ] **Step 2: Commit any fixes**

---

## Phases B, C, D — Outline (expand at implementation time)

### Phase B: Graph Editor Toolbar (6 tasks)

1. Create `src/ui/graphtoolbar.hpp` — toolbar component with zoom controls
2. Rewrite `src/ui/breadcrumb.hpp` — truncation, hover states, click navigation
3. Modify `src/ui/graphdisplayview.hpp` — 28px strip, absorb config buttons
4. Wire toolbar in `src/ui/grapheditorview.cpp` — connect to `setZoomScale()` etc.
5. Build and verify responsive breakpoints
6. Commit

**Full detailed plan:** Generate with `/superpowers:writing-plans Phase B graph toolbar` when ready.

### Phase C: Session Browser Polish (5 tasks)

1. Add segmented control (All Files / Recent) to `SessionBrowserPanel`
2. Implement two-line row painting (name + date/size)
3. Add empty state painting
4. Hook `sigSessionLoaded` for recently-opened tracking (with file existence filter)
5. Build, verify, commit

**Full detailed plan:** Generate when Phase A is complete.

### Phase D: Navigation Consolidation (8 tasks)

**Gate: Phases A and C must pass verification first.**

1. Create `src/ui/browsepanel.hpp` — tabbed Plugins + Sessions
2. Create `src/ui/inspectorpanel.hpp` — tabbed Node + Graph with auto-activation
3. Rewrite `src/ui/navigation.cpp` — icon sidebar replacing ConcertinaPanel
4. Update `include/element/ui/navigation.hpp` — new public API
5. Update `src/ui/standard.cpp` — 12 call site migrations
6. Update `include/element/ui/standard.hpp` and `src/ui/viewhelpers.hpp`
7. Add state migration for saved layouts
8. Remove dead `drawConcertinaPanelHeader` from style.hpp

**Full detailed plan:** Generate when Phases A and C pass gate criteria.
