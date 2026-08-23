// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

/// The Node Model.
// Representation of a Node.
// @classmod el.Node
// @pragma nostrip

#pragma once

#include <element/datapath.hpp>

#include "sol_helpers.hpp"

namespace element {
namespace lua {
// clang-format off
template <typename NT, typename... Args>
inline static sol::table new_nodetype (lua_State* L, const char* name, Args&&... args)
{
    using namespace element;
    using namespace sol;
    using Node = NT;
    sol::state_view lua (L);
    auto M = lua.create_table();
    M.new_usertype<Node> (name, no_constructor, 
        meta_function::length, &Node::getNumNodes,
        meta_function::index, [] (Node* self, int index) {
            const auto child = self->getNode (index - 1);
            return child.isValid() ? std::make_shared<Node> (child.data(), false)
                                    : std::shared_ptr<Node>(); 
        },

        /// Attributes.
        // @section attritubes

        /// The node's name (@{string}).
        // @field Node.name
        "name", sol::property (
            [] (Node& self) { return self.getName().toStdString(); },
            [] (Node& self, const char* name) { self.setName (name); }
        ),
        
        /// Validity flag (bool).
        // False if this node isn't valid.
        // @field Node.valid
        "valid",    sol::readonly_property (&Node::isValid),

        /// Methods.
        // @section methods

        /// Returns the display name of this node.
        // @function Node:displayName
        // @within Methods
        // @treturn string The name to use for display.
        "displayName", [] (Node* self) { return self->getDisplayName().toStdString(); },
        
        /// Returns the original plugin name of this node.
        // @function Node:pluginName
        // @within Methods
        // @treturn string The plugin name.
        "pluginName",  [] (Node* self) { return self->getPluginName().toStdString(); },

        /// Returns true if the node has been renamed.
        // @function Node:hasModifiedName
        // @within Methods
        // @return bool True if modified.
        "hasModifiedName", &Node::hasModifiedName,
        
        /// Returns a session-wide unique ID.
        // @function Node:uuidString
        // @treturn string
        "uuidString",  [](Node& self) { return self.getUuidString().toStdString(); },
        
        /// Returns a graph-wide unique ID.
        // @function Node:nodeId
        // @treturn int
        "nodeId",      [](Node& self) { return static_cast<lua_Integer> (self.getNodeId()); },

        /// Returns the type of this node.
        // Usage of this method is only used to determine if the node is a
        // graph or not.  Subject to change and add more types.
        // @function Node:nodeType
        // @treturn string
        "nodeType",    [](Node& self) { return self.getNodeType().toString(); },

        /// Returns true if this is a graph.
        // @function Node:isGraph
        // @treturn bool
        "isGraph",     &Node::isGraph,

        /// Returns true if this is a root graph.
        // These exists as top level graphs in the @{el.Session}
        // @function Node:isRoot
        // @treturn bool
        "isRoot",      &Node::isRootGraph,

        /// Convert to XML string.
        // @function Node::toXmlString
        // @treturn string
        "toXmlString", [] (Node* self) -> std::string {
            auto copy = self->data().createCopy();
            element::Node::sanitizeRuntimeProperties (copy, true);
            return copy.toXmlString().toStdString();
        },

        /// Save state.
        // @function Node:saveState
        "saveState",    &Node::savePluginState,

        /// Restore state.
        // @function Node:restoreState
        "restoreState", &Node::restorePluginState,

        "missing",     &Node::isMissing,
        
        
        
        "enabled",     &Node::isEnabled,
        "bypassed",    &Node::isBypassed,
        "muted",       &Node::isMuted,

        // Phase E-3: Restrict Node:writeFile() to paths strictly inside the
        // Element data directory. Without this clamp, a malicious Lua
        // script can overwrite arbitrary files reachable by the host
        // process (e.g. ~/.ssh/, ~/.bashrc, the user's Documents folder).
        //
        // Containment uses juce::File::isAChildOf(), which correctly handles
        // sibling-prefix bypasses (`/Users/x/ElementHACK/...` does NOT
        // satisfy isAChildOf(`/Users/x/Element`)) — a naive startsWith()
        // would let that through.
        //
        // `..` segments are rejected explicitly because juce normalizes
        // them silently inside getFullPathName() on some platforms; the
        // raw string check forecloses any platform-quirk leak.
        //
        // The check accepts:
        //   * absolute paths whose normalized form is a descendant of
        //     DataPath::applicationDataDir()
        //
        // It rejects (returns false):
        //   * relative paths
        //   * paths containing any `..` traversal segment
        //   * paths outside the data directory (incl. sibling-prefix dirs)
        "writeFile", [] (const Node& node, const char* filepath) -> bool {
            if (filepath == nullptr || *filepath == '\0')
                return false;
            const auto raw = String::fromUTF8 (filepath);
            if (! File::isAbsolutePath (raw))
                return false;
            // Refuse any '..' segment to prevent traversal escapes.
            for (auto& seg : StringArray::fromTokens (raw, "/\\", {}))
                if (seg == "..")
                    return false;
            const auto target = File (raw);
            const auto root   = DataPath::applicationDataDir();
            if (! root.exists() && ! root.createDirectory().wasOk())
                return false;
            // isAChildOf is the canonical juce containment check — it does
            // NOT match sibling prefixes (so `/x/ElementHACK` is not a
            // child of `/x/Element`).
            if (! target.isAChildOf (root))
                return false;
            return node.writeToFile (target);
        },

        "resetPorts",   &Node::resetPorts,

        std::forward<Args> (args)...
    );
    return removeAndClear (M, name);
}
// clang-format off

} // namespace lua
} // namespace element
