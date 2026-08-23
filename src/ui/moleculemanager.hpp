// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include "ElementApp.h"
#include <element/node.hpp>
#include <element/tags.hpp>

namespace element {

class GraphEditorComponent;

/** A Molecule represents a reusable group of nodes with their connections and states.
    Similar to "presets" in Unreal Engine or "Node Groups" in Blender.
*/
class Molecule
{
public:
    Molecule() = default;
    explicit Molecule (const ValueTree& data) : moleculeData (data) {}

    /** Create a molecule from a selection of nodes */
    static Molecule createFromSelection (const Node& graph, const Array<uint32>& nodeIds, const String& name);

    /** Check if the molecule is valid */
    bool isValid() const { return moleculeData.isValid() && moleculeData.hasType ("Molecule"); }

    /** Get the name of the molecule */
    String getName() const { return moleculeData.getProperty ("name", "Untitled"); }

    /** Set the name */
    void setName (const String& name) { moleculeData.setProperty ("name", name, nullptr); }

    /** Get the description */
    String getDescription() const { return moleculeData.getProperty ("description", ""); }

    /** Set the description */
    void setDescription (const String& desc) { moleculeData.setProperty ("description", desc, nullptr); }

    /** Get creation date */
    Time getCreatedDate() const
    {
        return Time (static_cast<int64> (moleculeData.getProperty ("created", 0)));
    }

    /** Get the number of nodes in this molecule */
    int getNumNodes() const { return moleculeData.getChildWithName (tags::nodes).getNumChildren(); }

    /** Get underlying data */
    ValueTree& data() { return moleculeData; }
    const ValueTree& data() const { return moleculeData; }

    /** Save to file */
    bool saveToFile (const File& file) const;

    /** Load from file */
    static Molecule loadFromFile (const File& file);

    /** Insert this molecule into a graph at the given position.
        @deprecated Use GraphEditorComponent::insertMolecule() instead.
        This method returns false and asserts; direct insertion is not supported.
        @see GraphEditorComponent::insertMolecule() */
    [[deprecated("Use GraphEditorComponent::insertMolecule() instead")]]
    bool insertIntoGraph (Node& graph, double x, double y) const;

private:
    ValueTree moleculeData;
};

/** Manages the library of saved molecules */
class MoleculeLibrary
{
public:
    MoleculeLibrary();
    ~MoleculeLibrary();

    /** Get the directory where molecules are stored */
    File getMoleculeDirectory() const;

    /** Scan the library directory for molecules */
    void refresh();

    /** Get all molecules in the library */
    const Array<Molecule>& getMolecules() const { return molecules; }

    /** Get molecules matching a search query */
    Array<Molecule> search (const String& query) const;

    /** Add a molecule to the library */
    bool addMolecule (const Molecule& molecule);

    /** Remove a molecule from the library */
    bool removeMolecule (const String& name);

    /** Get a molecule by name */
    Molecule getMolecule (const String& name) const;

    /** Check if a molecule exists */
    bool hasMolecule (const String& name) const;

private:
    Array<Molecule> molecules;
    File libraryDir;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MoleculeLibrary)
};

} // namespace element
