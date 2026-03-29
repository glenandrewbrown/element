// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include "ui/moleculemanager.hpp"
#include <element/context.hpp>

namespace element {

//=============================================================================
// Molecule Implementation
//=============================================================================

Molecule Molecule::createFromSelection (const Node& graph, const Array<uint32>& nodeIds, const String& name)
{
    if (! graph.isValid() || nodeIds.isEmpty())
        return Molecule();

    ValueTree data ("Molecule");
    data.setProperty ("name", name, nullptr);
    data.setProperty ("description", "", nullptr);
    data.setProperty ("created", Time::getCurrentTime().toMilliseconds(), nullptr);
    data.setProperty ("version", 1, nullptr);

    // Store nodes
    ValueTree nodesData (tags::nodes);

    // Calculate bounds for relative positioning
    double minX = std::numeric_limits<double>::max();
    double minY = std::numeric_limits<double>::max();

    // First pass: find bounds
    for (auto nodeId : nodeIds)
    {
        Node node = graph.getNodeById (nodeId);
        if (! node.isValid())
            continue;

        double x, y;
        node.getPosition (x, y);
        minX = jmin (minX, x);
        minY = jmin (minY, y);
    }

    // Second pass: store nodes with relative positions
    for (auto nodeId : nodeIds)
    {
        Node node = graph.getNodeById (nodeId);
        if (! node.isValid())
            continue;

        // Create a copy of the node data
        ValueTree nodeData = node.data().createCopy();

        // Adjust position to be relative to the group's origin
        double x, y;
        node.getPosition (x, y);
        nodeData.setProperty (tags::x, x - minX, nullptr);
        nodeData.setProperty (tags::y, y - minY, nullptr);

        // Save the plugin state
        if (auto* proc = node.getObject())
        {
            MemoryBlock state;
            proc->getState (state);
            if (state.getSize() > 0)
            {
                nodeData.setProperty (tags::state, state.toBase64Encoding(), nullptr);
            }
        }

        // Store original node ID for connection mapping
        nodeData.setProperty ("originalNodeId", static_cast<int64> (nodeId), nullptr);

        nodesData.appendChild (nodeData, nullptr);
    }

    data.appendChild (nodesData, nullptr);

    // Store internal connections (connections between selected nodes)
    ValueTree arcsData (tags::arcs);
    auto graphArcs = graph.getArcsValueTree();

    for (int i = 0; i < graphArcs.getNumChildren(); ++i)
    {
        auto arcData = graphArcs.getChild (i);
        uint32 srcNode = static_cast<uint32> (static_cast<int64> (arcData.getProperty (tags::sourceNode)));
        uint32 dstNode = static_cast<uint32> (static_cast<int64> (arcData.getProperty (tags::destNode)));

        // Only include connections where both nodes are in the selection
        if (nodeIds.contains (srcNode) && nodeIds.contains (dstNode))
        {
            arcsData.appendChild (arcData.createCopy(), nullptr);
        }
    }

    data.appendChild (arcsData, nullptr);

    return Molecule (data);
}

bool Molecule::saveToFile (const File& file) const
{
    if (! isValid())
        return false;

    if (auto xml = moleculeData.createXml())
    {
        return xml->writeTo (file);
    }

    return false;
}

Molecule Molecule::loadFromFile (const File& file)
{
    if (! file.existsAsFile())
        return Molecule();

    if (auto xml = XmlDocument::parse (file))
    {
        auto data = ValueTree::fromXml (*xml);
        if (data.hasType ("Molecule"))
            return Molecule (data);
    }

    return Molecule();
}

bool Molecule::insertIntoGraph (Node& graph, double x, double y) const
{
    if (! isValid() || ! graph.isValid())
        return false;

    // NOTE: Direct graph insertion is not supported.
    // Use GraphEditorComponent::insertMolecule() instead, which handles:
    // - Creating nodes through the proper message system
    // - Setting up connections between nodes
    // - Positioning nodes relative to the insertion point
    // - Integrating with the undo system
    //
    // This method returns false to indicate that callers should use
    // the GraphEditorComponent API instead.

    jassertfalse; // Use GraphEditorComponent::insertMolecule() instead
    return false;
}

//=============================================================================
// MoleculeLibrary Implementation
//=============================================================================

MoleculeLibrary::MoleculeLibrary()
{
    libraryDir = File::getSpecialLocation (File::userApplicationDataDirectory)
                     .getChildFile ("Element")
                     .getChildFile ("Molecules");

    if (! libraryDir.exists())
        libraryDir.createDirectory();

    refresh();
}

MoleculeLibrary::~MoleculeLibrary() {}

File MoleculeLibrary::getMoleculeDirectory() const
{
    return libraryDir;
}

void MoleculeLibrary::refresh()
{
    molecules.clear();

    auto files = libraryDir.findChildFiles (File::findFiles, false, "*.molecule");
    for (auto& file : files)
    {
        auto mol = Molecule::loadFromFile (file);
        if (mol.isValid())
            molecules.add (mol);
    }

    // Sort by name using a struct comparator (JUCE Array::sort requires lvalue reference)
    struct MoleculeComparator
    {
        static int compareElements (const Molecule& a, const Molecule& b)
        {
            return a.getName().compareIgnoreCase (b.getName());
        }
    };
    MoleculeComparator comparator;
    molecules.sort (comparator);
}

Array<Molecule> MoleculeLibrary::search (const String& query) const
{
    if (query.isEmpty())
        return molecules;

    Array<Molecule> results;
    String lowerQuery = query.toLowerCase();

    for (auto& mol : molecules)
    {
        if (mol.getName().toLowerCase().contains (lowerQuery) ||
            mol.getDescription().toLowerCase().contains (lowerQuery))
        {
            results.add (mol);
        }
    }

    return results;
}

bool MoleculeLibrary::addMolecule (const Molecule& molecule)
{
    if (! molecule.isValid())
        return false;

    String filename = molecule.getName().replaceCharacters (" /\\:*?\"<>|", "_________") + ".molecule";
    File file = libraryDir.getChildFile (filename);

    if (molecule.saveToFile (file))
    {
        refresh();
        return true;
    }

    return false;
}

bool MoleculeLibrary::removeMolecule (const String& name)
{
    for (int i = 0; i < molecules.size(); ++i)
    {
        if (molecules[i].getName() == name)
        {
            String filename = name.replaceCharacters (" /\\:*?\"<>|", "_________") + ".molecule";
            File file = libraryDir.getChildFile (filename);

            if (file.deleteFile())
            {
                molecules.remove (i);
                return true;
            }
        }
    }

    return false;
}

Molecule MoleculeLibrary::getMolecule (const String& name) const
{
    for (auto& mol : molecules)
    {
        if (mol.getName() == name)
            return mol;
    }

    return Molecule();
}

bool MoleculeLibrary::hasMolecule (const String& name) const
{
    for (auto& mol : molecules)
    {
        if (mol.getName() == name)
            return true;
    }

    return false;
}

//=============================================================================
// PluginUsageTracker Implementation
//=============================================================================

PluginUsageTracker::PluginUsageTracker()
{
    settingsFile = File::getSpecialLocation (File::userApplicationDataDirectory)
                       .getChildFile ("Element")
                       .getChildFile ("plugin_usage.xml");

    load();
}

PluginUsageTracker::~PluginUsageTracker()
{
    save();
}

void PluginUsageTracker::recordUsage (const PluginDescription& desc)
{
    String identifier = desc.createIdentifierString();
    int index = findEntry (identifier);

    if (index >= 0)
    {
        recentlyUsed.getReference (index).lastUsed = Time::getCurrentTime();
        recentlyUsed.getReference (index).useCount++;

        // Move to front
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

    // Keep only the most recent 50 entries
    while (recentlyUsed.size() > 50)
        recentlyUsed.removeLast();

    save();
}

void PluginUsageTracker::toggleFavorite (const PluginDescription& desc)
{
    String identifier = desc.createIdentifierString();

    if (favoriteIdentifiers.contains (identifier))
        favoriteIdentifiers.removeString (identifier);
    else
        favoriteIdentifiers.add (identifier);

    save();
}

bool PluginUsageTracker::isFavorite (const PluginDescription& desc) const
{
    return favoriteIdentifiers.contains (desc.createIdentifierString());
}

Array<PluginDescription> PluginUsageTracker::getFavorites() const
{
    // Note: This returns identifiers, the caller will need to look them up
    // in the KnownPluginList
    Array<PluginDescription> results;
    // Implementation requires access to KnownPluginList
    return results;
}

Array<PluginDescription> PluginUsageTracker::getRecentlyUsed (int maxItems) const
{
    Array<PluginDescription> results;
    // Implementation requires access to KnownPluginList
    return results;
}

void PluginUsageTracker::save()
{
    ValueTree data ("PluginUsage");

    // Save recently used
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

    // Save favorites
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

        // Load recently used
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

        // Load favorites
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
    save();
}

int PluginUsageTracker::findEntry (const String& identifier) const
{
    for (int i = 0; i < recentlyUsed.size(); ++i)
    {
        if (recentlyUsed[i].pluginIdentifier == identifier)
            return i;
    }

    return -1;
}

StringArray PluginUsageTracker::getRecentlyUsedIdentifiers (int maxItems) const
{
    StringArray identifiers;
    for (int i = 0; i < jmin (maxItems, recentlyUsed.size()); ++i)
    {
        identifiers.add (recentlyUsed[i].pluginIdentifier);
    }
    return identifiers;
}

bool PluginUsageTracker::isRecentlyUsed (const PluginDescription& desc) const
{
    String identifier = desc.createIdentifierString();
    return findEntry (identifier) >= 0;
}

} // namespace element
