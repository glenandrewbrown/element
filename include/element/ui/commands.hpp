// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/gui_basics.hpp>

namespace element {

class Commands : public juce::ApplicationCommandManager {
public:
    Commands() {}
    ~Commands() {}

    enum IDs : juce::CommandID {
        invalid = -1,

        showAbout = 0x0100,
        showLegacyView,
        showPluginManager,
        showPreferences,
        showSessionConfig,
        showGraphConfig,
        showPatchBay,
        showGraphEditor,
        showLastContentView,
        showAllPluginWindows,
        showKeymapEditor,
        hideAllPluginWindows,

        toggleVirtualKeyboard,
        rotateContentView,

        mediaClose,
        mediaOpen,
        mediaNew,
        mediaSave,
        mediaSaveAs,

        showControllers,
        toggleUserInterface,
        toggleChannelStrip,
        showGraphMixer,
        showConsole,
        toggleMeterBridge,

        sessionClose = 0x0300,
        sessionOpen,
        sessionNew,
        sessionSave,
        sessionSaveAs,
        sessionAddGraph,
        sessionDuplicateGraph = 900,
        sessionDeleteGraph = 901,
        sessionInsertPlugin = 902,

        exportGraph,
        importGraph,

        panic,
        importSession,

        checkNewerVersion = 0x0500,

        signIn,
        signOut,

        transportRewind = 0x0600,
        transportForward,
        transportPlay,
        transportRecord,
        transportSeekZero,
        transportStop,

        graphNew = 0x0700,
        graphOpen,
        graphSave,
        graphSaveAs,

        recentsClear = 0x1000,

        showPanelSession = 0x1100,
        showPanelBrowse,
        showPanelInspector,
        showPanelEditor,
        graphZoomIn,
        graphZoomOut,
        graphFitToView,

        quit = juce::StandardApplicationCommandIDs::quit,
        copy = juce::StandardApplicationCommandIDs::copy,
        undo = juce::StandardApplicationCommandIDs::undo,
        redo = juce::StandardApplicationCommandIDs::redo,
        paste = juce::StandardApplicationCommandIDs::paste,
        cut = juce::StandardApplicationCommandIDs::cut,
        selectAll = juce::StandardApplicationCommandIDs::selectAll
    };

    inline static juce::Array<juce::CommandID> getAllCommands()
    {
        return {
            copy,
            quit,
            undo,
            redo,
            paste,
            cut,
            selectAll,
            showAbout,
            showLegacyView,
            showPluginManager,
            showPreferences,
            showSessionConfig,
            showGraphConfig,
            showPatchBay,
            showGraphEditor,
            showLastContentView,
            showAllPluginWindows,
            showKeymapEditor,
            hideAllPluginWindows,

            toggleVirtualKeyboard,
            rotateContentView,

            mediaClose,
            mediaOpen,
            mediaNew,
            mediaSave,
            mediaSaveAs,

            showControllers,
            toggleUserInterface,
            toggleChannelStrip,
            showGraphMixer,
            showConsole,
            toggleMeterBridge,

            sessionClose,
            sessionOpen,
            sessionNew,
            sessionSave,
            sessionSaveAs,
            sessionAddGraph,
            sessionDuplicateGraph,
            sessionDeleteGraph,
            sessionInsertPlugin,

            exportGraph,
            importGraph,

            panic,
            importSession,

            checkNewerVersion,

            signIn,
            signOut,

            transportRewind,
            transportForward,
            transportPlay,
            transportRecord,
            transportSeekZero,
            transportStop,

            graphNew,
            graphOpen,
            graphSave,
            graphSaveAs,

            recentsClear,

            showPanelSession,
            showPanelBrowse,
            showPanelInspector,
            showPanelEditor,
            graphZoomIn,
            graphZoomOut,
            graphFitToView,
        };
    }

    inline static juce::String toString (juce::CommandID command)
    {
        switch (command) {
            case Commands::quit:
                return "quit";
                break;
            case Commands::undo:
                return "undo";
                break;
            case Commands::redo:
                return "redo";
                break;
            case Commands::showAbout:
                return "showAbout";
                break;
            case Commands::showLegacyView:
                return "showLegacyView";
                break;
            case Commands::showPluginManager:
                return "showPluginManager";
                break;
            case Commands::showPreferences:
                return "showPreferences";
                break;
            case Commands::showSessionConfig:
                return "showSessionConfig";
                break;
            case Commands::showGraphConfig:
                return "showGraphConfig";
                break;
            case Commands::showPatchBay:
                return "showPatchBay";
                break;
            case Commands::showGraphEditor:
                return "showGraphEditor";
                break;
            case Commands::showLastContentView:
                return "showLastContentView";
                break;
            case Commands::showAllPluginWindows:
                return "showAllPluginWindows";
                break;
            case Commands::showKeymapEditor:
                return "showKeymapEditor";
                break;
            case Commands::hideAllPluginWindows:
                return "hideAllPluginWindows";
                break;
            case Commands::toggleVirtualKeyboard:
                return "toggleVirtualKeyboard";
                break;
            case Commands::rotateContentView:
                return "rotateContentView";
                break;
            case Commands::showControllers:
                return "showControllers";
                break;
            case Commands::toggleUserInterface:
                return "toggleUserInterface";
                break;
            case Commands::toggleChannelStrip:
                return "toggleChannelStrip";
                break;
            case Commands::showGraphMixer:
                return "showGraphMixer";
                break;
            case Commands::showConsole:
                return "showConsole";
                break;
            case Commands::panic:
                return "panic";
                break;
            case Commands::graphNew:
                return "graphNew";
                break;
            case Commands::graphOpen:
                return "graphOpen";
                break;
            case Commands::graphSave:
                return "graphSave";
                break;
            case Commands::graphSaveAs:
                return "graphSaveAs";
                break;
            case Commands::recentsClear:
                return "recentsClear";
                break;
            case Commands::showPanelSession:
                return "showPanelSession";
                break;
            case Commands::showPanelBrowse:
                return "showPanelBrowse";
                break;
            case Commands::showPanelInspector:
                return "showPanelInspector";
                break;
            case Commands::showPanelEditor:
                return "showPanelEditor";
                break;
            case Commands::graphZoomIn:
                return "graphZoomIn";
                break;
            case Commands::graphZoomOut:
                return "graphZoomOut";
                break;
            case Commands::graphFitToView:
                return "graphFitToView";
                break;

            case Commands::copy:
                return "copy";
            case Commands::paste:
                return "paste";
            case Commands::cut:
                return "cut";
            case Commands::selectAll:
                return "selectAll";

            case Commands::mediaNew:
                return "mediaNew";
            case Commands::mediaOpen:
                return "mediaOpen";
            case Commands::mediaClose:
                return "mediaClose";
            case Commands::mediaSave:
                return "mediaSave";
            case Commands::mediaSaveAs:
                return "mediaSaveAs";

            case Commands::sessionNew:
                return "sessionNew";
            case Commands::sessionOpen:
                return "sessionOpen";
            case Commands::sessionClose:
                return "sessionClose";
            case Commands::sessionSave:
                return "sessionSave";
            case Commands::sessionSaveAs:
                return "sessionSaveAs";
            case Commands::sessionAddGraph:
                return "sessionAddGraph";

            case Commands::exportGraph:
                return "exportGraph";
            case Commands::importGraph:
                return "importGraph";
            case Commands::importSession:
                return "importSession";

            case Commands::toggleMeterBridge:
                return "toggleMeterBridge";

            case Commands::transportRewind:
                return "transportRewind";
            case Commands::transportForward:
                return "transportForward";
            case Commands::transportPlay:
                return "transportPlay";
            case Commands::transportRecord:
                return "transportRecord";
            case Commands::transportSeekZero:
                return "transportSeekZero";
            case Commands::transportStop:
                return "transportStop";

            default:
                break;
        }

        return {};
    }

    inline static juce::CommandID fromString (const juce::String& str)
    {
        if (str == "quit")
            return Commands::quit;

        if (str == "showAbout")
            return Commands::showAbout;
        if (str == "showLegacyView")
            return Commands::showLegacyView;
        if (str == "showPluginManager")
            return Commands::showPluginManager;
        if (str == "showPreferences")
            return Commands::showPreferences;
        if (str == "showSessionConfig")
            return Commands::showSessionConfig;
        if (str == "showGraphConfig")
            return Commands::showGraphConfig;
        if (str == "showPatchBay")
            return Commands::showPatchBay;
        if (str == "showGraphEditor")
            return Commands::showGraphEditor;
        if (str == "showLastContentView")
            return Commands::showLastContentView;
        if (str == "showAllPluginWindows")
            return Commands::showAllPluginWindows;
        if (str == "showKeymapEditor")
            return Commands::showKeymapEditor;
        if (str == "hideAllPluginWindows")
            return Commands::hideAllPluginWindows;

        if (str == "toggleVirtualKeyboard")
            return Commands::toggleVirtualKeyboard;
        if (str == "rotateContentView")
            return Commands::rotateContentView;

        if (str == "showControllers")
            return Commands::showControllers;
        if (str == "toggleUserInterface")
            return Commands::toggleUserInterface;
        if (str == "toggleChannelStrip")
            return Commands::toggleChannelStrip;
        if (str == "showGraphMixer")
            return Commands::showGraphMixer;
        if (str == "showConsole")
            return Commands::showConsole;

        if (str == "panic")
            return Commands::panic;

        if (str == "graphNew")
            return Commands::graphNew;
        if (str == "graphOpen")
            return Commands::graphOpen;
        if (str == "graphSave")
            return Commands::graphSave;
        if (str == "graphSaveAs")
            return Commands::graphSaveAs;

        if (str == "recentsClear")
            return Commands::recentsClear;

        if (str == "showPanelSession")
            return Commands::showPanelSession;
        if (str == "showPanelBrowse")
            return Commands::showPanelBrowse;
        if (str == "showPanelInspector")
            return Commands::showPanelInspector;
        if (str == "showPanelEditor")
            return Commands::showPanelEditor;
        if (str == "graphZoomIn")
            return Commands::graphZoomIn;
        if (str == "graphZoomOut")
            return Commands::graphZoomOut;
        if (str == "graphFitToView")
            return Commands::graphFitToView;

        if (str == "undo")
            return Commands::undo;
        if (str == "redo")
            return Commands::redo;
        if (str == "copy")
            return Commands::copy;
        if (str == "paste")
            return Commands::paste;
        if (str == "cut")
            return Commands::cut;
        if (str == "selectAll")
            return Commands::selectAll;

        if (str == "mediaNew")
            return Commands::mediaNew;
        if (str == "mediaOpen")
            return Commands::mediaOpen;
        if (str == "mediaClose")
            return Commands::mediaClose;
        if (str == "mediaSave")
            return Commands::mediaSave;
        if (str == "mediaSaveAs")
            return Commands::mediaSaveAs;

        if (str == "sessionNew")
            return Commands::sessionNew;
        if (str == "sessionOpen")
            return Commands::sessionOpen;
        if (str == "sessionClose")
            return Commands::sessionClose;
        if (str == "sessionSave")
            return Commands::sessionSave;
        if (str == "sessionSaveAs")
            return Commands::sessionSaveAs;
        if (str == "sessionAddGraph")
            return Commands::sessionAddGraph;

        if (str == "exportGraph")
            return Commands::exportGraph;
        if (str == "importGraph")
            return Commands::importGraph;
        if (str == "importSession")
            return Commands::importSession;

        if (str == "toggleMeterBridge")
            return Commands::toggleMeterBridge;

        if (str == "transportRewind")
            return Commands::transportRewind;
        if (str == "transportForward")
            return Commands::transportForward;
        if (str == "transportPlay")
            return Commands::transportPlay;
        if (str == "transportRecord")
            return Commands::transportRecord;
        if (str == "transportSeekZero")
            return Commands::transportSeekZero;
        if (str == "transportStop")
            return Commands::transportStop;

        return Commands::invalid;
    }

    inline static juce::String toOSCAddress (juce::CommandID command)
    {
        auto commandStr = toString (command);
        if (commandStr.isEmpty())
            return {};

        juce::String addy = "/element/command/";
        addy << commandStr;
        return addy;
    }

    inline static juce::StringArray getOSCAddresses()
    {
        juce::StringArray res;
        for (auto command : getAllCommands()) {
            const auto addy = toOSCAddress (command);
            if (addy.isNotEmpty())
                res.add (addy);
        }
        return res;
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Commands)
};

} // namespace element
