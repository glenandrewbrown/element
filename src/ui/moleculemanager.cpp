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

} // namespace element
