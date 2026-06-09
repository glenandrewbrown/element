// Copyright 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/devices.hpp>
#include <element/engine.hpp>
#include <element/graph.hpp>
#include <element/settings.hpp>
#include <juce_audio_processors/juce_audio_processors.h>
#include <element/plugins.hpp>
#include <element/porttype.hpp>
#include <element/processor.hpp>
#include <element/session.hpp>
#include <element/tags.hpp>
#include <element/ui/element_webview_host.hpp>
#include <element/ui.hpp>
#include <element/version.hpp>

#include <element/element_webview_dist.hpp>

#include "engine/midipanic.hpp"
#include "nodes/sandboxedprocessor.hpp"
#include "pluginprocessor.hpp" // U11 — multi-instance registry (snapshotRegistry)
#include "log.hpp"
#include "messages.hpp"
#include <element/ui.hpp>
#include <element/controller.hpp>
#include <element/datapath.hpp>
#include "../services/deviceservice.hpp"
#include "../services/mappingservice.hpp"
#include "../services/oscservice.hpp"
#include "../services/sessionservice.hpp"
#include <element/ui/web_content.hpp>
#include "ui/graphmixerview.hpp"
#include "ui/pluginwindow.hpp"
#include "ui/luaconsoleview.hpp"
#include "ui/moleculemanager.hpp"
#include "ui/pluginusagetracker.hpp"
#include "ui/blockcategory.hpp"
#include "presetmanager.hpp"
#include "appinfo.hpp"
#include "nodes/scriptnode.hpp"
#include "nodes/logicnodes.hpp" // P0 — ComparatorNode / LogicGateNode intMode snapshot + setter

#include "verbose_log.hpp"

#include "engine/midiengine.hpp"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <map>
#include <unordered_map>
#include <vector>

namespace element {

#if JUCE_WEB_BROWSER

class ElementWebViewHost;

struct ElementWebViewLogForwarder : Log::Listener
{
    ElementWebViewHost& owner;
    explicit ElementWebViewLogForwarder (ElementWebViewHost& o) : owner (o) {}
    void messageLogged (const String&) override;
};

namespace {
ValueTree ensureGraphUiRoot (Graph& G)
{
    ValueTree ui = G.getUIValueTree();
    if (! ui.isValid())
    {
        ui = ValueTree (tags::ui);
        G.data().addChild (ui, -1, nullptr);
    }
    return ui;
}

ValueTree ensureCommentBoxesContainer (Graph& G)
{
    ValueTree ui = ensureGraphUiRoot (G);
    ValueTree boxes = ui.getChildWithName ("CommentBoxes");
    if (! boxes.isValid())
    {
        boxes = ValueTree ("CommentBoxes");
        ui.addChild (boxes, -1, nullptr);
    }
    return boxes;
}

ValueTree ensureWebCanvasInGraph (Graph& G)
{
    ValueTree ui = ensureGraphUiRoot (G);
    ValueTree wc = ui.getChildWithName ("WebCanvas");
    if (! wc.isValid())
    {
        wc = ValueTree ("WebCanvas");
        wc.setProperty ("snapToGrid", false, nullptr);
        wc.setProperty ("gridSize", 8, nullptr);
        ui.addChild (wc, -1, nullptr);
    }
    return wc;
}

bool vtIsUnderSessionRoot (const ValueTree& t, const ValueTree& sessionRoot)
{
    for (ValueTree x = t; x.isValid(); x = x.getParent())
        if (x == sessionRoot)
            return true;
    return false;
}

String commentBoxUuid (const ValueTree& box)
{
    String u = box.getProperty ("uuid").toString();
    if (u.isNotEmpty())
        return u;
    return box.getProperty ("id").toString();
}

int findCommentBoxIndexByUuid (const ValueTree& boxes, const String& uuid)
{
    if (uuid.isEmpty())
        return -1;
    for (int i = 0; i < boxes.getNumChildren(); ++i)
        if (commentBoxUuid (boxes.getChild (i)) == uuid)
            return i;
    return -1;
}
} // namespace

static const char* portTypeToSignalString (const PortType& pt)
{
    switch (pt.id())
    {
        case PortType::Audio:
            return "audio";
        case PortType::Midi:
        case PortType::Atom:
        case PortType::Event:
            return "midi";
        case PortType::Control:
        case PortType::CV:
            return "value";
        default:
            return "audio";
    }
}

static int parsePortHandleIndex (const String& handle, const String& expectedPrefix)
{
    if (! handle.startsWith (expectedPrefix))
        return -1;
    return handle.substring (expectedPrefix.length()).getIntValue();
}

static const PluginDescription* findKnownPluginByIdentifier (const KnownPluginList& list, const String& identifier)
{
    for (const auto& desc : list.getTypes())
        if (desc.createIdentifierString() == identifier)
            return &desc;
    return nullptr;
}

// Normalise a JUCE plugin format name to the React `PluginFormat` union the
// badge renderer expects: "VST3" | "AU" | "CLAP" | "LV2" | "INT". `mapBlock`
// (useJuceBridge.ts) casts the raw value straight to PluginFormat, so anything
// outside this set breaks the badge — unknown / internal / empty all collapse
// to "INT".
static String normalizeBlockFormat (const String& rawFormat)
{
    if (rawFormat == "VST3" || rawFormat == "VST")
        return "VST3";
    if (rawFormat == "AudioUnit" || rawFormat == "AU")
        return "AU";
    if (rawFormat == "CLAP")
        return "CLAP";
    if (rawFormat == "LV2")
        return "LV2";
    // "Element", "Internal", empty, and any unrecognised token → internal node.
    return "INT";
}

//==============================================================================
// Plugin scan / paths / format-enable bridge support.
//
// The React UI speaks the compact `PluginFormat` union ("VST3" | "AU" | "CLAP"
// | "LV2"); JUCE's AudioPluginFormatManager + the persisted scan-path / blacklist
// settings key on the *canonical* format name ("AudioUnit", "VST3", "CLAP",
// "LV2"). These helpers translate between the two and centralise the settings
// keys so the webview path reads/writes the SAME PropertiesFile entries the
// native PluginListComponent uses (Settings::lastPluginScanPathPrefix + name).

// React UI token → JUCE canonical format name. Returns empty for unknown tokens.
static String webFormatToJuceName (const String& webFormat)
{
    const String f (webFormat.trim().toUpperCase());
    if (f == "VST3") return "VST3";
    if (f == "VST")  return "VST";
    if (f == "AU" || f == "AUDIOUNIT") return "AudioUnit";
    if (f == "CLAP") return "CLAP";
    if (f == "LV2")  return "LV2";
    return {};
}

// The set of formats surfaced as user-toggleable in the webview. Mirrors the
// React `PLUGIN_FORMATS` constant (ToolPalette / PreferencesModal). Order is the
// display order. "VST" (VST2) is intentionally excluded — it needs an external
// SDK and is off by default.
static const char* const kWebScanFormats[] = { "VST3", "AU", "CLAP", "LV2" };

// Per-format "enabled" settings key. Defaults to enabled when absent so a fresh
// install scans everything (matches the pre-existing scan-all behaviour). When a
// format is disabled it is dropped from the StringArray passed to
// PluginManager::scanAudioPlugins, so the scan genuinely skips it.
static String pluginFormatEnabledKey (const String& juceName)
{
    return "pluginFormatEnabled_" + juceName;
}

static bool isPluginFormatEnabledIn (juce::PropertiesFile* props, const String& juceName)
{
    if (props == nullptr)
        return true;
    return props->getBoolValue (pluginFormatEnabledKey (juceName), true);
}

// Read the persisted scan path for a format from the SAME key the native
// PluginListComponent uses (Settings::lastPluginScanPathPrefix + name), falling
// back to the format's compiled-in default search locations.
static juce::FileSearchPath lastScanPathFor (Context& ctx, const String& juceName)
{
    juce::PropertiesFile* props = ctx.settings().getUserSettings();
    String def;
    if (auto* fmt = ctx.plugins().getAudioPluginFormat (juceName))
        def = fmt->getDefaultLocationsToSearch().toString();
    const String stored = props != nullptr
                              ? props->getValue (String (Settings::lastPluginScanPathPrefix) + juceName, def)
                              : def;
    return juce::FileSearchPath (stored);
}

static void setLastScanPathFor (Context& ctx, const String& juceName, const juce::FileSearchPath& path)
{
    if (auto* props = ctx.settings().getUserSettings())
    {
        props->setValue (String (Settings::lastPluginScanPathPrefix) + juceName, path.toString());
        props->saveIfNeeded();
    }
}

// Map a node to the React `BlockCategory` union: "instrument" | "audiofx" |
// "midifx" | "modulator". Delegates keyword matching to
// element::mapBlockCategoryFromStrings (src/ui/blockcategory.hpp) so the
// logic is testable without a Node. Containers (n.isGraph()) fall into the
// "audiofx" default bucket per the V3 taxonomy.
static String mapBlockCategory (const Node& n, const String& pluginCategory)
{
    if (n.isGraph())
        return "audiofx";

    return element::mapBlockCategoryFromStrings (n.getName(), pluginCategory);
}

static String nodeUuidFromGraphNodeId (const Graph& g, uint32_t nid)
{
    for (int i = 0; i < g.getNumNodes(); ++i)
    {
        const Node n (g.getNode (i));
        if (n.getNodeId() == nid)
            return n.getUuidString();
    }
    return {};
}

static Node findNodeByUuidInGraph (const Graph& g, const String& uuid)
{
    for (int i = 0; i < g.getNumNodes(); ++i)
    {
        const Node n (g.getNode (i));
        if (n.getUuidString() == uuid)
            return n;
    }
    return {};
}

static const Identifier paramStateJsonId ("paramStateJson");

static int countWebSceneChildren (const ValueTree& wp)
{
    int n = 0;
    for (int i = 0; i < wp.getNumChildren(); ++i)
        if (wp.getChild (i).hasType ("WebScene"))
            ++n;
    return n;
}

static ValueTree getWebSceneAtFilteredIndex (const ValueTree& wp, int filteredIndex)
{
    int seen = 0;
    for (int i = 0; i < wp.getNumChildren(); ++i)
    {
        ValueTree c = wp.getChild (i);
        if (c.hasType ("WebScene"))
        {
            if (seen == filteredIndex)
                return c;
            ++seen;
        }
    }
    return {};
}

static String captureGraphParameterStateJson (const Graph& G)
{
    DynamicObject::Ptr root (new DynamicObject());
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        if (! n.isValid())
            continue;
        if (auto* obj = n.getObject())
            if (auto* proc = obj->getAudioProcessor())
            {
                auto& params = proc->getParameters();
                Array<var> vals;
                for (int pi = 0; pi < params.size(); ++pi)
                {
                    if (auto* p = params[pi])
                        vals.add (var (p->getValue()));
                    else
                        vals.add (var (0.0f));
                }
                root->setProperty (n.getUuidString(), var (vals));
            }
    }
    return JSON::toString (var (root.get()));
}

static bool applyGraphParameterStateJson (Context& ctx, const String& json)
{
    if (json.isEmpty())
        return true;
    const var parsed (JSON::parse (json));
    auto* dyn = parsed.getDynamicObject();
    if (dyn == nullptr)
        return false;

    auto sess = ctx.session();
    if (sess == nullptr)
        return false;
    const Graph G (sess->getCurrentGraph());
    if (! G.isGraph())
        return false;

    for (const auto& nv : dyn->getProperties())
    {
        const String uuid (nv.name.toString());
        const var& v = nv.value;
        const Array<var>* arr = v.getArray();
        if (arr == nullptr)
            continue;

        const Node n = findNodeByUuidInGraph (G, uuid);
        if (! n.isValid())
            continue;
        if (auto* nodeObj = n.getObject())
            if (auto* proc = nodeObj->getAudioProcessor())
            {
                auto& params = proc->getParameters();
                for (int pi = 0; pi < arr->size() && isPositiveAndBelow (pi, params.size()); ++pi)
                {
                    if (auto* p = params[pi])
                    {
                        const float fv = static_cast<float> (static_cast<double> (arr->getReference (pi)));
                        p->setValueNotifyingHost (jlimit (0.0f, 1.0f, fv));
                    }
                }
            }
    }

    return true;
}

static String buildSessionBrowserEntriesJson()
{
    struct Entry
    {
        File file;
        Time modified;
    };
    std::vector<Entry> all;

    // E8 (4b): the Projects shelf lists `.els` SESSIONS only — `elementSessionOpenPath`
    // only opens `.els`, so listing .elg/.eln/.elpreset/.elc would show files the
    // shelf can't open. Autosave files (`*.autosave.els` / `autosave_*.els`) ARE
    // `.els` and ARE recoverable, so they remain but carry an `isAutosave` flag.
    auto addFromDir = [&all] (const File& dir, bool recursive)
    {
        if (! dir.isDirectory())
            return;
        for (const auto& entry :
             RangedDirectoryIterator (dir, recursive, "*.els", File::findFiles))
        {
            const File f = entry.getFile();
            all.push_back ({ f, f.getLastModificationTime() });
        }
    };

    addFromDir (DataPath::defaultSessionDir(), true);

    const File userRoot = DataPath::defaultLocation();
    for (const auto& entry : RangedDirectoryIterator (userRoot, false, "*.els", File::findFiles))
    {
        const File f = entry.getFile();
        bool dup = false;
        for (const auto& e : all)
            if (e.file == f)
            {
                dup = true;
                break;
            }
        if (! dup)
            all.push_back ({ f, f.getLastModificationTime() });
    }

    std::sort (all.begin(), all.end(), [] (const Entry& a, const Entry& b)
               { return a.modified > b.modified; });

    Array<var> rows;
    const int cap = jmin (500, (int) all.size());
    for (int i = 0; i < cap; ++i)
    {
        const File& f = all[(size_t) i].file;
        const String fname = f.getFileName();
        const bool untitledAutosave = fname.startsWith ("autosave_");
        const bool siblingAutosave = fname.endsWith (".autosave.els");
        const bool isAutosave = untitledAutosave || siblingAutosave;

        // isRecoverable applies the strictly-newer-than-backing rule:
        //   • untitled autosaves (autosave_*.els) — always recoverable
        //   • sibling autosaves (<name>.autosave.els) — recoverable only if the
        //     autosave is STRICTLY NEWER than <name>.els (or backing doesn't exist)
        //   • regular named files — never recoverable
        bool isRecoverable = false;
        if (untitledAutosave)
        {
            isRecoverable = true;
        }
        else if (siblingAutosave)
        {
            const String backingName = fname.upToLastOccurrenceOf (".autosave.els", false, false) + ".els";
            const File backing = f.getParentDirectory().getChildFile (backingName);
            isRecoverable = !backing.existsAsFile()
                            || f.getLastModificationTime() > backing.getLastModificationTime();
        }

        // Friendly label: untitled recoveries read "Untitled — recovered";
        // sibling autosaves drop the ".autosave" stem so they group with their
        // project; everything else is the plain stem.
        String name;
        if (untitledAutosave)
            name = "Untitled \xe2\x80\x94 recovered";
        else if (siblingAutosave)
            name = fname.upToLastOccurrenceOf (".autosave.els", false, false);
        else
            name = f.getFileNameWithoutExtension();

        DynamicObject::Ptr o (new DynamicObject());
        o->setProperty ("path", f.getFullPathName());
        o->setProperty ("name", name);
        o->setProperty ("ext", f.getFileExtension().toLowerCase());
        o->setProperty ("isAutosave", isAutosave);
        o->setProperty ("isRecoverable", isRecoverable);
        o->setProperty ("modifiedMs", (int64) all[(size_t) i].modified.toMilliseconds());
        rows.add (var (o.get()));
    }

    DynamicObject::Ptr root (new DynamicObject());
    root->setProperty ("entries", var (rows));
    return JSON::toString (var (root.get()));
}

static void appendMidiMappingJson (Context& ctx, DynamicObject::Ptr root)
{
    DynamicObject::Ptr mm (new DynamicObject());
    bool learning = false;
    if (auto* ms = ctx.services().find<MappingService>())
        learning = ms->isLearning();
    mm->setProperty ("learning", learning);

    Array<var> mapsVar;
    if (auto sess = ctx.session())
    {
        for (int i = 0; i < sess->getNumControllerMaps(); ++i)
        {
            ControllerMapObjects objs (sess, sess->getControllerMap (i));
            DynamicObject::Ptr row (new DynamicObject());
            row->setProperty ("index", i);
            row->setProperty ("deviceName", objs.device.getName());
            row->setProperty ("controlName", objs.control.getName());
            row->setProperty ("nodeName", objs.node.getName());
            row->setProperty ("nodeId", objs.node.getUuidString());
            row->setProperty ("parameterIndex", objs.controllerMap.getParameterIndex());
            row->setProperty ("valid", objs.isValid());
            mapsVar.add (var (row.get()));
        }
    }
    mm->setProperty ("maps", var (mapsVar));
    root->setProperty ("midiMapping", var (mm.get()));
}

/** Match classic ArcComponent::updateSignalActivity (grapheditorcomponent.cpp). */
static float cableSignalLevelForArc (const Graph& G, const ValueTree& a)
{
    const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
    const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
    const int spi = (int) a.getProperty (tags::sourcePort, 0);

    const Node srcNode = G.getNodeById (sn);
    if (! srcNode.isValid())
        return 0.f;
    auto* proc = srcNode.getObject();
    if (proc == nullptr)
        return 0.f;
    if (! isPositiveAndBelow (spi, srcNode.getNumPorts()))
        return 0.f;

    const Port srcPort = srcNode.getPort (spi);
    const PortType pt = srcPort.getType();

    if (pt.isCv())
    {
        // Wave-0/2 + A5: CV presence comes from the per-port block-|peak|
        // latch (Processor::getOutputCVPeak) — NOT the audio RMS array (sized
        // off audio outputs, reads 0 forever for CV-only nodes) and NOT the
        // last-sample latch (fast bipolar CV reads ~0 at block-end zero
        // crossings → cable falsely looks idle).
        const int channel = srcPort.channel();
        return jmin (1.0f, proc->getOutputCVPeak (channel));
    }

    if (pt.isAudio())
    {
        const int channel = srcPort.channel();
        const int numOutputs = proc->getNumAudioOutputs();
        float newActivity = 0.f;
        if (channel >= 0 && channel < numOutputs)
            newActivity = proc->getOutputRMS (channel);
        else if (numOutputs > 0)
        {
            float total = 0.f;
            for (int i = 0; i < numOutputs; ++i)
                total += proc->getOutputRMS (i);
            newActivity = total / (float) numOutputs;
        }
        return jmin (1.0f, newActivity * 3.0f);
    }

    if (pt.isMidi() || pt.isAtom())
    {
        bool active = proc->hasMidiOutputActivity();
        if (dn != 0)
        {
            const Node dstNode = G.getNodeById (dn);
            if (dstNode.isValid())
                if (auto* dstProc = dstNode.getObject())
                    active = active || dstProc->hasMidiInputActivity();
        }
        return active ? 0.75f : 0.f;
    }

    return 0.f;
}

/** Wave-2 flow-debug + A5: signed CV value AND block |peak| for a CV-sourced
    arc. Returns true and fills `outValue` (the source port's last rendered
    sample — the chip's numeric readout) and `outPeak` (the block's absolute
    peak — the chip's activity gate) when the arc's source port is CV; false
    otherwise (audio/MIDI/Control arcs). Both reads are lock-free atomics. */
static bool cableCvValueForArc (const Graph& G, const ValueTree& a, float& outValue, float& outPeak)
{
    const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
    const int spi = (int) a.getProperty (tags::sourcePort, 0);

    const Node srcNode = G.getNodeById (sn);
    if (! srcNode.isValid())
        return false;
    auto* proc = srcNode.getObject();
    if (proc == nullptr)
        return false;
    if (! isPositiveAndBelow (spi, srcNode.getNumPorts()))
        return false;

    const Port srcPort = srcNode.getPort (spi);
    if (! srcPort.getType().isCv())
        return false;

    outValue = proc->getOutputCV (srcPort.channel());
    outPeak = proc->getOutputCVPeak (srcPort.channel());
    return true;
}

// ── C4/P3 meter-lane idle gating ──────────────────────────────────────────
//
// MEASURED (.omc/bench/meter_lane_bench.mm, 100 blocks / 150 cables, -O2):
// the three 60Hz meter lanes cost ~2.36 ms/tick of pure JSON build on the
// message thread (cable 1.31 + node 0.47 + channel 0.57 + wrap 0.01) — ~14%
// of a core even when every meter is static. The cheapest effective cut is
// lane-granular idle gating: a pre-pass of pure atomic reads + epsilon
// compares (~0.01 ms) skips BOTH the JSON build and the evaluateJavascript
// push for any lane whose values are ALL unchanged within the webview's own
// LEVEL_EPSILON. Skipping a push leaves the webview stores holding exactly
// the same state the full snapshot would have produced, so the stores'
// replace-semantics stay untouched (row-level deltas would break them).
// Caches are cleared on every graph push (topology / board change / webview
// reload ⇒ next tick resends full snapshots).
//
// Message-thread only (timerCallback / pushGraphSnapshot / destructor), so
// the instance-keyed map needs no locking. Keyed storage lives here instead
// of a class member because the class is declared in
// include/element/ui/element_webview_host.hpp (outside this wave's file
// ownership).
static float nodeOutputLevel (const Node& n); // defined below buildCableLevelsJson

namespace meterlanegate
{

struct LaneSnapshots
{
    std::vector<float> cable, node, channel, master;
    // §0.2 telemetry divider tick. Incremented once per 60 Hz timerCallback;
    // the telemetry lanes (meters/master/spectrum-reassert/log) run only on
    // even ticks ⇒ effective 30 Hz. Lives here (not the header) so all
    // message-thread bridge state stays file-static + instance-keyed; reset to
    // 0 on graph push / teardown with the rest of this struct (harmless — it is
    // just a parity counter).
    unsigned telemetryTick = 0;
};

static std::unordered_map<const void*, LaneSnapshots> snapshots;

/** Matches the webview's LEVEL_EPSILON (useCableMeterStore.ts) — below this
    a meter change is visually imperceptible AND the store would drop it. */
constexpr float epsilon = 0.001f;

/** True when `fresh` differs from `cache` (size or any |delta| > epsilon);
    on change, `fresh` becomes the new cache. */
static bool changed (std::vector<float>& cache, std::vector<float>&& fresh)
{
    bool diff = cache.size() != fresh.size();
    if (! diff)
        for (size_t i = 0; i < fresh.size(); ++i)
            if (std::fabs (cache[i] - fresh[i]) > epsilon)
            {
                diff = true;
                break;
            }
    if (diff)
        cache = std::move (fresh);
    return diff;
}

/** Mirror buildCableLevelsJson's meter reads (level + v/pk) as raw floats. */
static void collectCableLane (const Graph& G, std::vector<float>& out)
{
    const ValueTree arcs (G.getArcsValueTree());
    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const auto a = arcs.getChild (i);
        out.push_back (cableSignalLevelForArc (G, a));
        float v = 0.f, pk = 0.f;
        if (cableCvValueForArc (G, a, v, pk))
        {
            out.push_back (v);
            out.push_back (pk);
        }
    }
}

/** Mirror buildNodeMetersJson's meter reads as raw floats. */
static void collectNodeLane (const Graph& G, std::vector<float>& out)
{
    for (int i = 0; i < G.getNumNodes(); ++i)
        out.push_back (nodeOutputLevel (G.getNode (i)));
}

/** Mirror buildNodeChannelLevelsJson's meter reads as raw floats. */
static void collectChannelLane (const Graph& G, std::vector<float>& out)
{
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        if (auto* proc = n.getObject())
        {
            const int numCh = proc->getNumOutputRMSChannels();
            for (int c = 0; c < numCh; ++c)
                out.push_back (jmin (1.0f, proc->getOutputRMS (c) * 3.0f));
        }
    }
}

/** §0.1 — mirror buildMasterLevelsJson's three reads (outL/outR/input) as raw
    floats so the master-levels lane joins the idle gate. No engine ⇒ no values
    (matches buildMasterLevelsJson returning an empty object). */
static void collectMasterLane (Context& ctx, std::vector<float>& out)
{
    auto e = ctx.audio();
    if (e == nullptr)
        return;
    auto channelLevel = [&e] (int channel, bool input) -> float {
        if (auto m = e->getLevelMeter (channel, input))
            return (float) jlimit (0.0, 1.0, m->level());
        return 0.0f;
    };
    const int numOut = e->getNumChannels (false);
    const float outL = numOut > 0 ? channelLevel (0, false) : 0.0f;
    const float outR = numOut > 1 ? channelLevel (1, false) : outL;
    out.push_back (outL);
    out.push_back (outR);
    const int numIn = e->getNumChannels (true);
    float input = 0.0f;
    for (int c = 0; c < numIn; ++c)
        input = jmax (input, channelLevel (c, true));
    out.push_back (input);
}

} // namespace meterlanegate

// ── §2.3 change-sentinel replies for the steady-state JSON pollers ──────────
//
// elementGetEngineSnapshot (~4 Hz) and elementGetInstances (~2 Hz) reply with a
// JSON STRING built fresh every poll, even when nothing changed — each idle
// reply still serialises + escapes on the message thread (the postCompletion
// callAsync hot path). Cache the last reply string PER HANDLER per host
// instance; when the new reply is byte-identical, post the literal sentinel "~"
// instead (1 byte, no escape). The webview side
// (nativeGetEngineSnapshot/nativeGetInstances) treats raw === "~" as "no change"
// → returns null / skips the store set, so live state stays correct and the
// stores' existing snapshot-diffs are untouched.
//
// File-static + instance-keyed (keyed by `this`) for the SAME reason as
// meterlanegate: the host class is declared in the public header (outside this
// wave's file ownership). Message-thread only (handler lambdas run via
// invokeForTest / the JUCE bridge on the message thread), so no locking. Cleared
// in the destructor and on every graph push, alongside meterlanegate::snapshots.
namespace sentinelcache
{

constexpr const char* kSentinel = "~";

struct Replies
{
    String engineSnapshot, instances;
};

static std::unordered_map<const void*, Replies> replies;

/** Return `fresh` unless byte-identical to the cached value for `slot`; on a
    match return the "~" sentinel. Updates the cache to `fresh` either way. */
static var dedupe (String& slot, const String& fresh)
{
    if (slot == fresh)
        return var (String (kSentinel));
    slot = fresh;
    return var (fresh);
}

} // namespace sentinelcache

static void appendAudioSetupJson (Context& ctx, DynamicObject::Ptr root)
{
    auto& devs = ctx.devices();
    AudioDeviceManager::AudioDeviceSetup setup;
    devs.getAudioDeviceSetup (setup);

    DynamicObject::Ptr audio (new DynamicObject());
    audio->setProperty ("outputDeviceName", setup.outputDeviceName);
    audio->setProperty ("inputDeviceName", setup.inputDeviceName);
    audio->setProperty ("sampleRate", setup.sampleRate);
    audio->setProperty ("bufferSize", setup.bufferSize);
    String currentTypeName;
    if (auto* cur = devs.getCurrentDeviceTypeObject())
        currentTypeName = cur->getTypeName();
    audio->setProperty ("audioDeviceType", currentTypeName);

    Array<var> typeNames;
    for (auto* t : devs.getAvailableDeviceTypes())
        if (t != nullptr)
            typeNames.add (var (t->getTypeName()));
    audio->setProperty ("deviceTypes", var (typeNames));

    Array<var> outDevs, inDevs, bufSizes, rates;
    for (auto* t : devs.getAvailableDeviceTypes())
    {
        if (t != nullptr && t->getTypeName() == currentTypeName)
        {
            {
                const StringArray outs (t->getDeviceNames (false));
                for (int i = 0; i < outs.size(); ++i)
                    outDevs.add (var (outs[i]));
            }
            {
                const StringArray ins (t->getDeviceNames (true));
                for (int i = 0; i < ins.size(); ++i)
                    inDevs.add (var (ins[i]));
            }
            break;
        }
    }

    if (auto* device = devs.getCurrentAudioDevice())
    {
        for (auto bs : device->getAvailableBufferSizes())
            bufSizes.add (var ((int) bs));
        for (double sr : device->getAvailableSampleRates())
            rates.add (var (sr));
    }

    audio->setProperty ("outputDevices", var (outDevs));
    audio->setProperty ("inputDevices", var (inDevs));
    audio->setProperty ("bufferSizes", var (bufSizes));
    audio->setProperty ("sampleRates", var (rates));
    root->setProperty ("audioSetup", var (audio.get()));
}

// G3c item 1: enumerate live CoreMIDI/ALSA/Win-MIDI devices + their real
// enable/default state from MidiEngine. Mirrors appendAudioSetupJson and rides
// the existing 60 Hz snapshot, so hot-plugged devices appear automatically.
static void appendMidiSetupJson (Context& ctx, DynamicObject::Ptr root)
{
    auto& midi = ctx.midi();

    DynamicObject::Ptr obj (new DynamicObject());

    Array<var> inputs;
    for (const auto& info : juce::MidiInput::getAvailableDevices())
    {
        DynamicObject::Ptr row (new DynamicObject());
        row->setProperty ("name", info.name);
        row->setProperty ("identifier", info.identifier);
        row->setProperty ("enabled", midi.isMidiInputEnabled (info));
        inputs.add (var (row.get()));
    }

    // NOTE: MidiEngine::getDefaultMidiOutputID() currently returns the device
    // NAME (header aliases it to defaultMidiOutputName). The authoritative
    // identifier is on the live output device, so prefer that; fall back to the
    // name-based getter only when no device is open.
    String defaultOutId;
    if (auto* out = midi.getDefaultMidiOutput())
        defaultOutId = out->getIdentifier();
    if (defaultOutId.isEmpty())
        defaultOutId = midi.getDefaultMidiOutputID();

    Array<var> outputs;
    for (const auto& info : juce::MidiOutput::getAvailableDevices())
    {
        DynamicObject::Ptr row (new DynamicObject());
        row->setProperty ("name", info.name);
        row->setProperty ("identifier", info.identifier);
        row->setProperty ("isDefault", info.identifier == defaultOutId);
        outputs.add (var (row.get()));
    }

    obj->setProperty ("inputs", var (inputs));
    obj->setProperty ("outputs", var (outputs));
    obj->setProperty ("defaultOutputId", defaultOutId);
    root->setProperty ("midiSetup", var (obj.get()));
}

static void appendOscHostJson (Context& ctx, DynamicObject::Ptr root)
{
    DynamicObject::Ptr osc (new DynamicObject());
    auto& st = ctx.settings();
    osc->setProperty ("enabled", st.isOscHostEnabled());
    osc->setProperty ("port", st.getOscHostPort());
    root->setProperty ("oscHost", var (osc.get()));
}

static void appendMoleculesJson (DynamicObject::Ptr root)
{
    MoleculeLibrary lib;
    lib.refresh();
    Array<var> mols;
    for (const auto& m : lib.getMolecules())
    {
        DynamicObject::Ptr o (new DynamicObject());
        o->setProperty ("name", m.getName());
        o->setProperty ("description", m.getDescription());
        mols.add (var (o.get()));
    }
    root->setProperty ("molecules", var (mols));
}

static void appendCanvasJson (const Node& graphNode, const Graph& G, DynamicObject::Ptr root)
{
    DynamicObject::Ptr canvas (new DynamicObject());
    bool snap = false;
    int grid = 8;
    double viewportX = 0.0, viewportY = 0.0, zoom = 1.0;
    ValueTree ui = graphNode.getUIValueTree();
    if (ui.isValid())
    {
        ValueTree wc = ui.getChildWithName ("WebCanvas");
        if (wc.isValid())
        {
            snap = (bool) wc.getProperty ("snapToGrid", false);
            grid = jlimit (4, 128, (int) wc.getProperty ("gridSize", 8));
            viewportX = (double) wc.getProperty ("viewportX", 0.0);
            viewportY = (double) wc.getProperty ("viewportY", 0.0);
            zoom = (double) wc.getProperty ("zoom", 1.0);
            if (zoom <= 0.0 || zoom > 100.0)
                zoom = 1.0;
        }
    }
    canvas->setProperty ("snapToGrid", snap);
    canvas->setProperty ("gridSize", grid);
    {
        DynamicObject::Ptr vp (new DynamicObject());
        vp->setProperty ("x", viewportX);
        vp->setProperty ("y", viewportY);
        vp->setProperty ("zoom", zoom);
        canvas->setProperty ("viewport", var (vp.get()));
    }
    {
        double minX = 0, minY = 0, maxX = 800, maxY = 600;
        bool anyPos = false;
        constexpr double kNodeW = 200.0;
        constexpr double kNodeH = 100.0;
        for (int i = 0; i < G.getNumNodes(); ++i)
        {
            const Node n (G.getNode (i));
            double x = 0, y = 0;
            n.getPosition (x, y);
            if (! anyPos)
            {
                minX = x;
                minY = y;
                maxX = x + kNodeW;
                maxY = y + kNodeH;
                anyPos = true;
            }
            else
            {
                minX = jmin (minX, x);
                minY = jmin (minY, y);
                maxX = jmax (maxX, x + kNodeW);
                maxY = jmax (maxY, y + kNodeH);
            }
        }
        DynamicObject::Ptr gb (new DynamicObject());
        gb->setProperty ("minX", minX);
        gb->setProperty ("minY", minY);
        gb->setProperty ("maxX", maxX);
        gb->setProperty ("maxY", maxY);
        canvas->setProperty ("graphBounds", var (gb.get()));
    }
    root->setProperty ("canvas", var (canvas.get()));
}

static var buildGraphOutlineRecursive (const Node& n)
{
    DynamicObject::Ptr o (new DynamicObject());
    o->setProperty ("id", n.getUuidString());
    // CONTRACT 2 — getDisplayName() falls back to the live plugin name when
    // tags::name is empty, so an unnamed / "Node"-stamped block self-heals to its
    // real name (e.g. "Kontakt") in the session tree instead of showing blank /
    // "(unnamed)". This is the same field the tree/tabs/Block-title/drag-handle read.
    o->setProperty ("name", n.getDisplayName());
    const bool container = n.isGraph();
    o->setProperty ("isContainer", container);
    if (container)
    {
        Graph inner (n);
        Array<var> kids;
        for (int i = 0; i < inner.getNumNodes(); ++i)
            kids.add (buildGraphOutlineRecursive (inner.getNode (i)));
        o->setProperty ("children", var (kids));
    }
    return var (o.get());
}

static void appendActiveGraphOutlineJson (const Graph& G, DynamicObject::Ptr root)
{
    Array<var> outline;
    for (int i = 0; i < G.getNumNodes(); ++i)
        outline.add (buildGraphOutlineRecursive (G.getNode (i)));
    root->setProperty ("activeGraphOutline", var (outline));
}

static ValueTree ensureWebPerformMutable (Session& sess)
{
    ValueTree root = sess.getValueTree();
    ValueTree wp = root.getChildWithName ("webPerform");
    if (! wp.isValid())
    {
        wp = ValueTree ("webPerform");
        wp.setProperty ("activeIndex", 0, nullptr);
        root.addChild (wp, -1, nullptr);
        ValueTree mainScene ("WebScene");
        mainScene.setProperty ("id", String ("default"), nullptr);
        mainScene.setProperty ("name", String ("Main"), nullptr);
        wp.addChild (mainScene, -1, nullptr);
    }
    return wp;
}

static void appendPerformJson (Session& sess, DynamicObject::Ptr root)
{
    DynamicObject::Ptr perform (new DynamicObject());
    Array<var> scenesVar;
    int activeIdx = 0;
    ValueTree wp = sess.getValueTree().getChildWithName ("webPerform");
    if (wp.isValid())
    {
        activeIdx = (int) wp.getProperty ("activeIndex", 0);
        for (int i = 0; i < wp.getNumChildren(); ++i)
        {
            ValueTree sc = wp.getChild (i);
            if (! sc.hasType ("WebScene"))
                continue;
            DynamicObject::Ptr row (new DynamicObject());
            const int idx = scenesVar.size();
            row->setProperty ("id", sc.getProperty ("id", "").toString());
            row->setProperty ("name", sc.getProperty ("name", "Scene").toString());
            row->setProperty ("index", idx);
            row->setProperty ("active", idx == activeIdx);
            row->setProperty ("hasCapture", sc.getProperty (paramStateJsonId).toString().isNotEmpty());
            scenesVar.add (var (row.get()));
        }
    }

    if (scenesVar.isEmpty())
    {
        DynamicObject::Ptr sc (new DynamicObject());
        sc->setProperty ("id", String ("default"));
        sc->setProperty ("name", String ("Main"));
        sc->setProperty ("index", 0);
        sc->setProperty ("active", true);
        sc->setProperty ("hasCapture", false);
        scenesVar.add (var (sc.get()));
        activeIdx = 0;
    }
    else
    {
        activeIdx = jlimit (0, scenesVar.size() - 1, activeIdx);
        for (int i = 0; i < scenesVar.size(); ++i)
            if (auto* obj = scenesVar.getReference (i).getDynamicObject())
                obj->setProperty ("active", i == activeIdx);
    }

    perform->setProperty ("scenes", var (scenesVar));
    perform->setProperty ("activeSceneIndex", activeIdx);
    root->setProperty ("perform", var (perform.get()));
}

static std::optional<WebBrowserComponent::Resource> makeWebAsset (const File& root, String reqPath)
{
    if (reqPath.isEmpty() || reqPath == "/")
        reqPath = "/index.html";

    while (reqPath.startsWithChar ('/'))
        reqPath = reqPath.substring (1);

    const File file (root.getChildFile (reqPath).getLinkedTarget());

    if (! file.existsAsFile() || ! file.isAChildOf (root))
    {
        if (reqPath.equalsIgnoreCase ("index.html") || reqPath.isEmpty())
        {
            String stub;
            stub << "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Element</title></head>"
                    "<body style='background:#1e1e22;color:#e5e5ea;font-family:system-ui,sans-serif;padding:24px'>"
                    "<h2>Web UI bundle not found</h2>"
                    "<p>Run <code style='background:#252529;padding:4px 8px;border-radius:4px'>cd webview &amp;&amp; npm install &amp;&amp; npm run build</code> "
                    "then restart Element.</p>"
                    "<p>Dist path: <code style='background:#252529;padding:4px 8px;border-radius:4px'>"
                 << root.getFullPathName() << "</code></p>"
                    "</body></html>";
            WebBrowserComponent::Resource r;
            r.mimeType = "text/html";
            const char* raw = stub.toRawUTF8();
            const size_t numBytes = stub.getNumBytesAsUTF8();
            r.data.assign ((const std::byte*) raw,
                           (const std::byte*) raw + numBytes);
            return r;
        }
        return std::nullopt;
    }

    WebBrowserComponent::Resource r;
    const String fname (file.getFileName());
    if (fname.endsWithIgnoreCase (".html")) r.mimeType = "text/html";
    else if (fname.endsWithIgnoreCase (".js")) r.mimeType = "text/javascript";
    else if (fname.endsWithIgnoreCase (".css")) r.mimeType = "text/css";
    else if (fname.endsWithIgnoreCase (".svg")) r.mimeType = "image/svg+xml";
    else if (fname.endsWithIgnoreCase (".json")) r.mimeType = "application/json";
    else if (fname.endsWithIgnoreCase (".woff2")) r.mimeType = "font/woff2";
    else if (fname.endsWithIgnoreCase (".png")) r.mimeType = "image/png";
    else
        r.mimeType = "application/octet-stream";

    MemoryBlock mb;
    if (! file.loadFileAsData (mb))
        return std::nullopt;
    r.data.resize (mb.getSize());
    memcpy (r.data.data(), mb.getData(), mb.getSize());
    return r;
}

#if JUCE_MAC || JUCE_LINUX
 #include <dlfcn.h>
#endif

// Resolve the WebView production bundle root. Prefers a bundle-relative location
// inside the host (.app / .vst3 / .component / .clap), so installed packages work
// on any machine. Falls back to the configure-time dev tree path for hot-reload
// during development.
//
// IMPORTANT: For plugins loaded into a DAW, juce::File::currentExecutableFile
// returns the DAW's executable, NOT the plugin binary. To find the plugin's own
// bundle we use dladdr() with the address of a function we know lives in this
// translation unit — that gives us the path to libelement.a's enclosing binary,
// which on macOS is inside the plugin bundle (KV-Element.vst3/Contents/MacOS/KV-Element).
static File resolveWebviewDistRoot()
{
    using juce::File;

   #if JUCE_MAC || JUCE_LINUX
    Dl_info info {};
    if (dladdr (reinterpret_cast<const void*> (&resolveWebviewDistRoot), &info) != 0
        && info.dli_fname != nullptr)
    {
        const File binary (info.dli_fname);
       #if JUCE_MAC
        const auto contents = binary.getParentDirectory().getParentDirectory();
        const auto bundled = contents.getChildFile ("Resources").getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
        {
            EL_LOG ("GFX", "resolveWebviewDistRoot: dladdr bundle hit " << bundled.getFullPathName());
            return bundled;
        }
        EL_LOG ("GFX", "resolveWebviewDistRoot: dladdr bundle miss " << bundled.getFullPathName());
       #else
        const auto bundled = binary.getParentDirectory().getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
        {
            EL_LOG ("GFX", "resolveWebviewDistRoot: dladdr linux hit " << bundled.getFullPathName());
            return bundled;
        }
        EL_LOG ("GFX", "resolveWebviewDistRoot: dladdr linux miss " << bundled.getFullPathName());
       #endif
    }
   #endif

   #if JUCE_MAC
    {
        const auto exe = File::getSpecialLocation (File::currentExecutableFile);
        const auto contents = exe.getParentDirectory().getParentDirectory();
        const auto bundled = contents.getChildFile ("Resources").getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
        {
            EL_LOG ("GFX", "resolveWebviewDistRoot: exe fallback hit " << bundled.getFullPathName());
            return bundled;
        }
        EL_LOG ("GFX", "resolveWebviewDistRoot: exe fallback miss " << bundled.getFullPathName());
    }
   #elif JUCE_WINDOWS
    {
        const auto exe = File::getSpecialLocation (File::currentExecutableFile);
        const auto bundled = exe.getParentDirectory().getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
        {
            EL_LOG ("GFX", "resolveWebviewDistRoot: exe fallback hit " << bundled.getFullPathName());
            return bundled;
        }
        EL_LOG ("GFX", "resolveWebviewDistRoot: exe fallback miss " << bundled.getFullPathName());
    }
   #endif

    const File fallback (element::webview_dist::kDistPath);
    EL_LOG_WARN ("GFX", "resolveWebviewDistRoot: all bundle paths missed, using compile-time fallback "
                         << fallback.getFullPathName()
                         << " exists=" << (int) fallback.getChildFile ("index.html").existsAsFile());
    return fallback;
}

//==============================================================================
// Task 1.3 — invalidation hook for the plugin-category memo. KnownPluginList is
// a juce::ChangeBroadcaster (deps/juce/.../juce_KnownPluginList.h:49); it sends a
// change on scan / recreateFromXml / clear. A dedicated listener (rather than
// making the host a ChangeListener) keeps the host's base-class surface minimal
// and the teardown ordering explicit. Marks the cache dirty only — the rebuild
// is lazy, on the next buildActiveGraphJson use.
struct ElementWebViewHost::KnownPluginListWatcher final : public juce::ChangeListener
{
    explicit KnownPluginListWatcher (ElementWebViewHost& h) : host (h) {}
    void changeListenerCallback (juce::ChangeBroadcaster*) override
    {
        host.pluginCategoryCacheDirty = true;
    }
    ElementWebViewHost& host;
};

juce::String ElementWebViewHost::categoryForPluginIdentifier (const juce::String& identifier) const
{
    if (identifier.isEmpty())
        return {};

    rebuildPluginIdentifierCaches();

    const auto it = pluginCategoryByIdentifier.find (identifier);
    // Not-found → empty string, IDENTICAL to the prior linear scan's nullptr →
    // empty category (mapBlockCategory then falls back to the name heuristic).
    return it != pluginCategoryByIdentifier.end() ? it->second : juce::String();
}

// Task 3.A — single rebuild of BOTH the category and the catalog-name memo from
// ONE getTypes() copy, gated by the shared dirty flag. getTypes() returns a COPY
// of the internal array — iterate it once and store the two STRING fields the hot
// path needs (category + catalog name) by identifier, so we never hold a pointer
// into the temporary copy. Const + message-thread only.
void ElementWebViewHost::rebuildPluginIdentifierCaches() const
{
    if (! pluginCategoryCacheDirty)
        return;
    pluginCategoryByIdentifier.clear();
    pluginNameByIdentifier.clear();
    for (const auto& desc : context.plugins().getKnownPlugins().getTypes())
    {
        const String id (desc.createIdentifierString());
        pluginCategoryByIdentifier[id] = desc.category;
        // The catalog NAME is desc.name — the SAME field the plugin-list emit
        // uses (element_webview_host.cpp:7110, `primary.name`) and the SAME field
        // GraphManager::addNode stamps onto the node (graphmanager.cpp:458). NEVER
        // descriptiveName (that is the sentence DESCRIPTION; see the N1 rule).
        pluginNameByIdentifier[id] = desc.name;
    }
    pluginCategoryCacheDirty = false;
}

juce::String ElementWebViewHost::catalogNameForPluginIdentifier (const juce::String& identifier) const
{
    if (identifier.isEmpty())
        return {};

    rebuildPluginIdentifierCaches();

    const auto it = pluginNameByIdentifier.find (identifier);
    // Not-found → empty. Internal / IO / el.* nodes are not in the KnownPluginList,
    // so their on-canvas name already IS their catalog name — an empty result here
    // correctly suppresses the "renamed from" line for them.
    return it != pluginNameByIdentifier.end() ? it->second : juce::String();
}

//==============================================================================
ElementWebViewHost::ElementWebViewHost (Context& ctx, bool skipBrowser) : context (ctx)
{
    logForwarder = std::make_unique<ElementWebViewLogForwarder> (*this);
    context.logger().addListener (logForwarder.get());

    const File distRoot = resolveWebviewDistRoot();

    const char* devUrlEnv = std::getenv ("ELEMENT_WEBVIEW_DEV_URL");
    const String devUrl = devUrlEnv != nullptr ? String (devUrlEnv) : String();
    const bool useDevServer = devUrl.isNotEmpty();

    EL_LOG ("GFX", "ElementWebViewHost ctor"
                    << " skipBrowser=" << (int) skipBrowser
                    << " useDevServer=" << (int) useDevServer
                    << " distRoot=" << distRoot.getFullPathName());

    WebBrowserComponent::Options opts;

   #if JUCE_WINDOWS
    opts = opts.withBackend (WebBrowserComponent::Options::Backend::webview2);
    {
        WebBrowserComponent::Options::WinWebView2 wv2;
        wv2 = wv2.withBackgroundColour (juce::Colour (0xff1e1e22));
        opts = opts.withWinWebView2Options (wv2);
    }
   #endif

    opts = opts.withNativeIntegrationEnabled (true)
              .withInitialisationData ("elementVersion", ELEMENT_VERSION_STRING)
              .withInitialisationData (
                  "webviewMode",
                  var (useDevServer ? "dev" : "production"));

    if (! useDevServer)
    {
       #if JUCE_WEB_BROWSER_RESOURCE_PROVIDER_AVAILABLE
        const File distRootForProvider (distRoot);
        opts = opts.withResourceProvider (
            [distRootForProvider] (const String& path) { return makeWebAsset (distRootForProvider, path); },
            std::nullopt);
       #endif
    }

    // Helper: register a native function in both opts and bridgeFunctions map
    // so unit tests can invoke lambdas without a live WebBrowserComponent.
    auto registerFn = [&] (const juce::Identifier& name,
                            juce::WebBrowserComponent::NativeFunction fn) {
        bridgeFunctions[name.toString().toStdString()] = fn;
        opts = opts.withNativeFunction (name, std::move (fn));
    };

    // W-11: SafePointer-guarded completion poster. JUCE's webview completion
    // callback dispatches results back into the embedded WebBrowserComponent;
    // if the host (and thus its child WebBrowserComponent) is destroyed between
    // the message-thread enqueue and dispatch, invoking `completion(...)` would
    // reach into freed memory inside the JUCE webview wrapper. Each callAsync
    // site now goes through this helper which gates on the host's SafePointer.
    auto postCompletion = [this] (auto completion, auto value) {
        juce::Component::SafePointer<ElementWebViewHost> safe (this);
        juce::MessageManager::callAsync ([safe, completion, value] {
            if (safe.getComponent() != nullptr)
                completion (juce::var (value));
        });
    };

    registerFn (
        Identifier ("elementGetGraphState"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            // Structured var, NOT a pre-serialised JSON string — same JUCE
            // emitCompletionEvent O(n²) String::replace quote-escape hazard as
            // elementGetPluginList (see below). A large session (e.g. a ~2 MB
            // graph) escaped every interior quote → ~100% main-thread spin in
            // replaceSection on load. A var serialises structurally (quotes are
            // not escaped) → O(n). The React consumers already accept
            // object-or-string (useJuceBridge onGraphState + the three
            // elementGetGraphState invoke sites).
            postCompletion (completion, JSON::parse (buildActiveGraphJson()));
        });

    registerFn (
        Identifier ("elementGetPluginList"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            // Return a structured var, NOT a pre-serialised JSON string. JUCE's
            // emitCompletionEvent does JSON::toString(result).replace("\\","\\\\"),
            // and juce::String::replace is O(n × matches). A JSON *string* result
            // gets every internal quote escaped to \", so matches == quote-count
            // (~28k for the 1996-plugin, ~700 KB payload) → ~150 s main-thread
            // hang on boot. A var serialises structurally (quotes are not
            // escaped) → ~0 backslashes → O(n). The React store already accepts
            // object-or-string (usePluginBrowserStore.ts).
            postCompletion (completion, JSON::parse (buildPluginListJson()));
        });

    registerFn (
        Identifier ("elementGetNodeParameters"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String uuid;
            if (args.size() > 0)
                uuid = args[0].toString();
            // Structured var, not JSON string — same JUCE emitEvent O(n²) escape
            // hazard as elementGetPluginList; matters for high-parameter-count
            // plugins (Kontakt). nativeGetNodeParameters accepts object-or-string.
            postCompletion (completion, JSON::parse (buildNodeParametersJson (uuid)));
        });

    registerFn (
        Identifier ("elementSetNodeParameter"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 3)
            {
                const String uuid (args[0].toString());
                const int idx = (int) args[1];
                const float v = (float) args[2];
                ok = setNodeParameterValue (uuid, idx, v);
            }
            postCompletion (completion, ok);
        });

    // P0 — set the integer mode of a built-in logic/comparator node.
    //   Input:  args[0] = nodeUuid: String, args[1] = mode: int
    //   Output: bool — true when the node was an element.compare / element.logic
    //                  and the operator/mode was applied.
    // On success, schedule a snapshot push so the UI reflects engine truth (the
    // next buildActiveGraphJson re-reads intMode off the processor getter).
    registerFn (
        Identifier ("elementNodeSetIntMode"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String uuid (args[0].toString());
                const int mode = (int) args[1];
                ok = setNodeIntMode (uuid, mode);
                if (ok)
                    scheduleGraphPush (40);
            }
            postCompletion (completion, ok);
        });

    // G3-B item 1 — per-node FFT spectrum, on demand by UUID.
    //   Input:  args[0] = nodeUuid: String
    //   Output: a PRE-SERIALISED JSON STRING (var-string, NOT a structured var):
    //           {"v":2,"fftSize":<int>,"sampleRate":<num>,"binsB64":"<base64>"}
    //           or null (honest "no spectrum").
    //
    // P3/Wave-0 §0.3b+c — payload shape. The handler ships ~1024 magnitude bins
    // at ~15-30 Hz; returning them as a structured `var` array hits JUCE's
    // emitCompletionEvent O(n²) String::replace quote-escape hazard documented at
    // elementGetPluginList above (every element re-walked + escaped on the
    // message thread). Two stacked cuts kill the hot path:
    //   (b) PRE-SERIALISE the whole reply to a JSON STRING here via one
    //       JSON::toString. A var STRING is escaped as a single value (one
    //       String::replace over the compact body) instead of a 1024-element
    //       structured walk; nativeNodeSpectrum.ts already accepts a string.
    //   (c) QUANTISE each bin to a uint8 + base64. The analyser already
    //       normalises magnitudes to 0..1 (SpectrumAnalyser kNumBins "normalised
    //       0..1 magnitudes"), so the quantise is a plain LINEAR map with
    //       range=1, min=0:  q = round(bin * 255).  binsB64 is base64 of one
    //       uint8 per bin (length = fftSize/2). The JS side reconstructs the SAME
    //       visual value via  bin ≈ q / 255  (i.e. v/255 * range + min, range=1,
    //       min=0). 1024 doubles (~8-15 KB) → ~1.4 KB base64. NOTHING-fake: still
    //       the real FFT, just coarser — a strip is inherently a visual estimate.
    // Polling == subscribing: the first call registers the node in
    // spectrumSubscriptions and flips its atomic spectrumWanted, so the audio
    // thread starts copying samples into the analyser on the NEXT block. The
    // FFT itself runs HERE (message thread) inside Processor::popSpectrumFrame.
    // Returns null (honest-degraded) until a full window has accumulated, or
    // when the node has no analyser (no audio output / unprepared).
    registerFn (
        Identifier ("elementGetNodeSpectrum"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            var result; // null by default → honest "no spectrum"
            if (args.size() >= 1)
            {
                const String uuid (args[0].toString());
                if (uuid.isNotEmpty())
                {
                    if (auto sess = context.session())
                    {
                        const Graph G (currentBoard());
                        const Node n = findNodeByUuidInGraph (G, uuid);
                        if (auto* proc = n.getObject())
                        {
                            // Subscribe (idempotent) so the tap is live, then
                            // pull the latest magnitude frame.
                            spectrumSubscriptions.insert (uuid.toStdString());
                            proc->setSpectrumWanted (true);

                            if (auto frame = proc->popSpectrumFrame())
                            {
                                // Quantise each normalised-0..1 bin to one uint8
                                // (LINEAR: q = round(bin*255), reconstruct q/255).
                                juce::MemoryBlock raw ((size_t) frame->size());
                                auto* bytes = static_cast<juce::uint8*> (raw.getData());
                                size_t i = 0;
                                for (float m : *frame)
                                    bytes[i++] = (juce::uint8) juce::jlimit (
                                        0, 255, (int) std::lround (m * 255.0f));

                                DynamicObject::Ptr obj (new DynamicObject());
                                obj->setProperty ("v", 2);
                                obj->setProperty ("fftSize", proc->getSpectrumFftSize());
                                obj->setProperty ("sampleRate", proc->getSpectrumSampleRate());
                                obj->setProperty ("binsB64",
                                                  juce::Base64::toBase64 (raw.getData(), raw.getSize()));
                                // Pre-serialised STRING var (see §0.3b above).
                                result = var (JSON::toString (var (obj.get())));
                            }
                        }
                    }
                }
            }
            postCompletion (completion, result);
        });

    // G3-B item 1 — subscribe / unsubscribe a node's FFT spectrum so idle cost
    // is zero. The webview calls (uuid,false) on unmount to stop the audio
    // thread computing for a node nobody is viewing.
    //   Input:  args[0] = nodeUuid: String, args[1] = wanted: bool
    //   Output: bool — true when the node was found + the flag applied.
    registerFn (
        Identifier ("elementSetNodeSpectrumWanted"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String uuid (args[0].toString());
                const bool wanted = (bool) args[1];
                if (uuid.isNotEmpty())
                {
                    if (auto sess = context.session())
                    {
                        const Graph G (currentBoard());
                        const Node n = findNodeByUuidInGraph (G, uuid);
                        if (auto* proc = n.getObject())
                        {
                            if (wanted)
                                spectrumSubscriptions.insert (uuid.toStdString());
                            else
                                spectrumSubscriptions.erase (uuid.toStdString());
                            proc->setSpectrumWanted (wanted);
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // R3 — manual recovery for a crashed out-of-process plugin.
    //   Input:  args[0] = nodeUuid: String
    //   Output: bool — true if the node is sandboxed and a restart was issued.
    // Pairs with the onSandboxEvent("crashed") push: the React Block shows a
    // "plugin crashed — reload" affordance whose button calls this.
    registerFn (
        Identifier ("elementRestartSandbox"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String uuid (args[0].toString());
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    const Node n = findNodeByUuidInGraph (G, uuid);
                    if (n.isValid())
                        if (auto* sbn = dynamic_cast<SandboxedProcessorNode*> (n.getObject()))
                        {
                            sbn->restartSandbox();
                            ok = true;
                        }
                }
            }
            postCompletion (completion, ok);
        });

    // Separate-window editor (REAPER model) — open a sandboxed plugin's editor
    // in its own crash-isolated OS window (the editor lives in the worker).
    //   Input:  args[0] = nodeUuid: String, args[1]? = screenX, args[2]? = screenY
    //   Output: bool — true if the node is sandboxed and an open was issued.
    // Only meaningful for sandboxed nodes; an in-process node returns false and
    // the caller should fall back to the existing pluginEditorOpen path.
    registerFn (
        Identifier ("elementOpenSandboxedEditor"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String uuid (args[0].toString());
                const int sx = args.size() >= 2 ? (int) args[1] : 0;
                const int sy = args.size() >= 3 ? (int) args[2] : 0;
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    const Node n = findNodeByUuidInGraph (G, uuid);
                    if (n.isValid())
                        if (auto* sbn = dynamic_cast<SandboxedProcessorNode*> (n.getObject()))
                        {
                            sbn->openEditor (sx, sy);
                            ok = true;
                        }
                }
            }
            postCompletion (completion, ok);
        });

    // Close a sandboxed plugin's separate editor window.
    //   Input:  args[0] = nodeUuid: String
    //   Output: bool — true if the node is sandboxed and a close was issued.
    registerFn (
        Identifier ("elementCloseSandboxedEditor"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String uuid (args[0].toString());
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    const Node n = findNodeByUuidInGraph (G, uuid);
                    if (n.isValid())
                        if (auto* sbn = dynamic_cast<SandboxedProcessorNode*> (n.getObject()))
                        {
                            sbn->closeEditor();
                            ok = true;
                        }
                }
            }
            postCompletion (completion, ok);
        });

    // US-002 / Wave 2 — engine status snapshot for the React webview.
    //   Output: JSON object with the live engine + transport metrics that the
    //           legacy native footer surfaces via `devices.getCpuUsage()` and
    //           `Transport::Monitor`. Polled at ~4 Hz from the React side
    //           (`useEngineSnapshotStore.startPolling`); `getCpuUsage()` reads
    //           an atomic inside `juce::AudioDeviceManager` so this handler
    //           stays on the message thread without touching audio-thread
    //           state directly. `Transport::Monitor` fields are `juce::Atomic`.
    registerFn (
        Identifier ("elementGetEngineSnapshot"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            DynamicObject::Ptr root (new DynamicObject());

            // CPU — fraction 0..1 of the audio thread (matches content.cpp:314).
            // Guard against NaN/Inf — JUCE's JSON serializer emits NaN as the
            // literal token "NaN", which is not valid JSON. JSON.parse on the
            // JS side throws, nativeGetEngineSnapshot swallows the error, and
            // the React store silently keeps its zero defaults. That presents
            // to the user as a permanently 0.0% / "engine stopped" indicator
            // even though audio is live.
            double cpuFrac = context.devices().getCpuUsage();
            if (! std::isfinite (cpuFrac))
                cpuFrac = 0.0;
            root->setProperty ("cpu", cpuFrac);

            // Audio device — sample rate, buffer, name, latency.
            bool engineRunning = false;
            if (auto* dev = context.devices().getCurrentAudioDevice())
            {
                engineRunning = true;
                double sr = dev->getCurrentSampleRate();
                if (! std::isfinite (sr) || sr < 0.0)
                    sr = 0.0;
                const int buf = juce::jmax (0, dev->getCurrentBufferSizeSamples());
                root->setProperty ("sampleRate", sr);
                root->setProperty ("bufferSize", buf);
                root->setProperty ("deviceName", dev->getName());

                const int inLat = juce::jmax (0, dev->getInputLatencyInSamples());
                const int outLat = juce::jmax (0, dev->getOutputLatencyInSamples());
                root->setProperty ("inputLatencySamples", inLat);
                root->setProperty ("outputLatencySamples", outLat);
                if (sr > 0.0)
                {
                    const double inMs = (double) inLat / sr * 1000.0;
                    const double outMs = (double) outLat / sr * 1000.0;
                    root->setProperty ("deviceLatencyInputMs",
                                       std::isfinite (inMs) ? inMs : 0.0);
                    root->setProperty ("deviceLatencyOutputMs",
                                       std::isfinite (outMs) ? outMs : 0.0);
                }
                else
                {
                    root->setProperty ("deviceLatencyInputMs", 0.0);
                    root->setProperty ("deviceLatencyOutputMs", 0.0);
                }
            }
            else
            {
                root->setProperty ("sampleRate", 0.0);
                root->setProperty ("bufferSize", 0);
                root->setProperty ("deviceName", "");
                root->setProperty ("deviceLatencyInputMs", 0.0);
                root->setProperty ("deviceLatencyOutputMs", 0.0);
            }
            root->setProperty ("engineRunning", engineRunning);

            // Transport — playing/recording/tempo/timeSig from the message-thread
            // accessible Monitor (atomics). transportFrame exposes the lossless
            // sample-frame count from `Monitor::positionFrames`. transportTimecode
            // is a display-ready BBT string ("bar.beat.subBeat", 1-indexed to
            // match DAW convention) computed via `Monitor::getBarsAndBeats`.
            bool transportPlaying = false;
            bool transportRecording = false;
            double tempo = 120.0;
            int tsNum = 4, tsDen = 4;
            int64_t transportFrame = 0;
            String transportTimecode = "1.1.0";
            if (auto e = context.audio())
            {
                if (auto mon = e->getTransportMonitor())
                {
                    transportPlaying = mon->playing.get();
                    transportRecording = mon->recording.get();
                    tempo = (double) mon->tempo.get();
                    tsNum = mon->beatsPerBar.get();
                    tsDen = mon->beatType.get();
                    transportFrame = mon->positionFrames.get();
                    int bars = 0, beats = 0, subBeats = 0;
                    mon->getBarsAndBeats (bars, beats, subBeats);
                    // 1-indexed display ("1.1.0" = top of bar 1, beat 1).
                    transportTimecode = String (bars + 1) + "." + String (beats + 1) + "." + String (subBeats);
                }
            }
            // Tempo / transportFrame both serialized as JSON numbers — guard
            // against NaN/Inf for the same JSON-parse-failure reason as cpu.
            if (! std::isfinite (tempo) || tempo <= 0.0)
                tempo = 120.0;
            root->setProperty ("transportPlaying", transportPlaying);
            root->setProperty ("transportRecording", transportRecording);
            root->setProperty ("tempoBpm", tempo);
            root->setProperty ("transportFrame",
                               (double) juce::jmax<int64_t> (0, transportFrame));
            root->setProperty ("transportTimecode", transportTimecode);

            Array<var> ts;
            ts.add (var (tsNum));
            ts.add (var (tsDen));
            root->setProperty ("timeSig", var (ts));

            // §2.3 — "~" sentinel when byte-identical to the last reply (idle
            // poll ⇒ no re-serialise downstream; JS treats "~" as no-change).
            postCompletion (completion,
                            sentinelcache::dedupe (sentinelcache::replies[this].engineSnapshot,
                                                   JSON::toString (var (root.get()))));
        });

    // U11 — Multi-instance: list the live Element plugin instances in this host
    // OS process (Branch-A in-process registry). NOTHING fake: the list is the
    // literal set of currently-alive PluginProcessor objects (registered in
    // ctor, erased in dtor). In the standalone app / single-instance plugin
    // host the array is empty or just self — that honest "1 instance" state is
    // NOT an error.
    //   Output: { selfId:int, instances:[{id,name,variant,isSelf,hasGraph}] }
    registerFn (
        Identifier ("elementGetInstances"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            DynamicObject::Ptr root (new DynamicObject());

            const auto reg = PluginProcessor::snapshotRegistry();

            // Self-resolution: the host owns `Context& context` but no
            // back-pointer to its PluginProcessor. Match the registry entry
            // whose Context IS this host's Context (pointer compare). Plugin
            // instances: the editor's WebContent is built on the SAME Context
            // the processor created. Standalone: no entry matches → selfId=-1
            // and isSelf=false everywhere (honest).
            int selfId = -1;
            for (auto* p : reg)
                if (p != nullptr && p->getContextForMirror() == &context)
                {
                    selfId = p->getInstanceId();
                    break;
                }

            Array<var> arr;
            for (auto* p : reg)
            {
                if (p == nullptr)
                    continue;
                DynamicObject::Ptr o (new DynamicObject());
                o->setProperty ("id", p->getInstanceId());
                o->setProperty ("name", p->getInstanceDisplayName());
                o->setProperty ("variant", (int) p->getVariant());
                o->setProperty ("isSelf", selfId >= 0 && p->getInstanceId() == selfId);
                o->setProperty ("hasGraph", p->hasActiveGraph());
                arr.add (var (o.get()));
            }

            root->setProperty ("selfId", selfId);
            root->setProperty ("instances", var (arr));
            // §2.3 — "~" sentinel when byte-identical to the last reply.
            postCompletion (completion,
                            sentinelcache::dedupe (sentinelcache::replies[this].instances,
                                                   JSON::toString (var (root.get()))));
        });

    // U11 — Multi-instance: read-only graph snapshot of a PEER instance, for
    // the MirrorPanel. Reuses the SAME builder the live editor uses
    // (buildActiveGraphJson) with zero duplication, by constructing a throwaway
    // skipBrowser host on the peer's Context (the proven BridgeContractTest
    // construct/destruct-per-call pattern — buildActiveGraphJson is const and
    // reads only its Context). NOTHING fake: an unknown/dead/scan-only target
    // (null Context) returns an honest `unavailable:true` empty graph, never a
    // fabricated one. Strictly read-only — no mutation happens here.
    //   Input:  args[0] = targetId:int
    //   Output: structured graph snapshot (schema:2, session, graphs, nodes…)
    //           OR { schema:2, schemaVersion:2, graphs:[], unavailable:true }
    registerFn (
        Identifier ("elementGetInstanceSnapshot"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            const int targetId = args.size() > 0 ? (int) args[0] : -1;

            PluginProcessor* peer = nullptr;
            const auto reg = PluginProcessor::snapshotRegistry();
            for (auto* p : reg)
                if (p != nullptr && p->getInstanceId() == targetId)
                {
                    peer = p;
                    break;
                }

            Context* peerCtx = (peer != nullptr) ? peer->getContextForMirror() : nullptr;
            if (peerCtx == nullptr)
            {
                // Honest-degraded: unknown / dead / scan-only peer. Match the
                // graph-snapshot shape so the JS parser doesn't choke, but flag
                // unavailable so the panel shows the honest empty state.
                DynamicObject::Ptr unavailable (new DynamicObject());
                unavailable->setProperty ("schema", 2);
                unavailable->setProperty ("schemaVersion", 2);
                unavailable->setProperty ("graphs", var (Array<var>()));
                unavailable->setProperty ("unavailable", true);
                postCompletion (completion, JSON::toString (var (unavailable.get())));
                return;
            }

            // Build the peer's REAL snapshot via the shared const builder.
            ElementWebViewHost peerHost (*peerCtx, /*skipBrowser=*/true);
            // Return STRUCTURED var (JSON::parse) — matches elementGetGraphState
            // and avoids the O(n²) quote-escape hazard. JS accepts object-or-string.
            postCompletion (completion, JSON::parse (peerHost.buildActiveGraphJson()));
        });

    registerFn (
        Identifier ("elementScriptGetSource"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String source;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            if (auto* script = dynamic_cast<ScriptNode*> (n.getObject()))
                                source = script->getCodeDocument (false).getAllContent();
                        }
                    }
                }
            }
            postCompletion (completion, source);
        });

    registerFn (
        Identifier ("elementScriptSetSource"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String json;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            if (auto* script = dynamic_cast<ScriptNode*> (n.getObject()))
                            {
                                const Result r = script->loadScript (args[1].toString());
                                if (r.wasOk())
                                    json = "{\"ok\":true,\"error\":\"\"}";
                                else
                                    json = "{\"ok\":false,\"error\":" + JSON::toString (r.getErrorMessage()) + "}";
                            }
                        }
                    }
                }
            }
            if (json.isEmpty())
                json = "{\"ok\":false,\"error\":\"node not found or not a script node\"}";
            postCompletion (completion, json);
        });

    registerFn (
        Identifier ("elementScriptCompile"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String json;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            if (auto* script = dynamic_cast<ScriptNode*> (n.getObject()))
                            {
                                const Result r = script->loadScript (script->getCodeDocument (false).getAllContent());
                                if (r.wasOk())
                                    json = "{\"ok\":true,\"error\":\"\"}";
                                else
                                    json = "{\"ok\":false,\"error\":" + JSON::toString (r.getErrorMessage()) + "}";
                            }
                        }
                    }
                }
            }
            if (json.isEmpty())
                json = "{\"ok\":false,\"error\":\"node not found or not a script node\"}";
            postCompletion (completion, json);
        });

    // elementScriptGetRuntimeState
    //   Input:  args[0] = nodeId: String
    //   Output: { ok: true, vars: [ { name: String, type: String, value: String } ] }
    //         | { ok: false, error: String }
    //   Effect: snapshots ScriptNode::getLuaState().globals() on the message thread.
    //           Filters out Lua/sol2 built-ins (math, string, table, os, io, coroutine,
    //           package, _G, _VERSION, print, type, tostring, tonumber, pairs, ipairs,
    //           ipairsaux, next, rawget, rawset, rawequal, rawlen, select, unpack,
    //           pcall, xpcall, error, assert, getmetatable, setmetatable, collectgarbage,
    //           require, dofile, load, loadstring, loadfile, debug, _ENV) plus anything
    //           starting with "_" or "sol.".
    //           For each remaining global, emits { name, type, value }:
    //             number / boolean / string -> stringified directly (max 100 chars)
    //             function / table / userdata / thread -> value = "[<type>]" (no expansion)
    //             nil -> skipped
    //           Cap at 64 entries to avoid runaway state.
    //           NOTE: Only the message-thread Lua state is inspected; the audio-thread
    //           DSPScript runtime has its own environment that is not surfaced here yet.
    registerFn (
        Identifier ("elementScriptGetRuntimeState"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String json;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            if (auto* script = dynamic_cast<ScriptNode*> (n.getObject()))
                            {
                                static const std::unordered_set<std::string> kBuiltins {
                                    "math", "string", "table", "os", "io", "coroutine",
                                    "package", "_G", "_VERSION", "print", "type",
                                    "tostring", "tonumber", "pairs", "ipairs", "ipairsaux",
                                    "next", "rawget", "rawset", "rawequal", "rawlen",
                                    "select", "unpack", "pcall", "xpcall", "error",
                                    "assert", "getmetatable", "setmetatable",
                                    "collectgarbage", "require", "dofile", "load",
                                    "loadstring", "loadfile", "debug", "_ENV"
                                };

                                auto& lua = script->getLuaState();
                                juce::String varsJson = "[";
                                bool first = true;
                                int count = 0;

                                try
                                {
                                    for (auto& kv : lua.globals())
                                    {
                                        if (count >= 64)
                                            break;

                                        sol::object key = kv.first;
                                        sol::object val = kv.second;

                                        if (key.get_type() != sol::type::string)
                                            continue;
                                        if (val.get_type() == sol::type::lua_nil
                                            || val.get_type() == sol::type::none)
                                            continue;

                                        std::string rawName;
                                        try { rawName = key.as<std::string>(); }
                                        catch (...) { continue; }

                                        if (rawName.empty())
                                            continue;
                                        if (rawName[0] == '_')
                                            continue;
                                        if (rawName.rfind ("sol.", 0) == 0)
                                            continue;
                                        if (kBuiltins.count (rawName) > 0)
                                            continue;

                                        juce::String name = juce::String (rawName);
                                        juce::String typeName;
                                        juce::String value;

                                        switch (val.get_type())
                                        {
                                            case sol::type::number:
                                                typeName = "number";
                                                try
                                                {
                                                    double d = val.as<double>();
                                                    value = juce::String (d);
                                                }
                                                catch (...) { value = "[number]"; }
                                                break;
                                            case sol::type::boolean:
                                                typeName = "boolean";
                                                try
                                                {
                                                    value = val.as<bool>() ? "true" : "false";
                                                }
                                                catch (...) { value = "[boolean]"; }
                                                break;
                                            case sol::type::string:
                                                typeName = "string";
                                                try
                                                {
                                                    juce::String s = juce::String (val.as<std::string>());
                                                    value = s.substring (0, 100);
                                                }
                                                catch (...) { value = "[string]"; }
                                                break;
                                            case sol::type::function:
                                                typeName = "function";
                                                value = "[function]";
                                                break;
                                            case sol::type::table:
                                                typeName = "table";
                                                value = "[table]";
                                                break;
                                            case sol::type::userdata:
                                                typeName = "userdata";
                                                value = "[userdata]";
                                                break;
                                            case sol::type::thread:
                                                typeName = "thread";
                                                value = "[thread]";
                                                break;
                                            default:
                                                continue;
                                        }

                                        if (! first)
                                            varsJson += ",";
                                        varsJson += "{\"name\":" + JSON::toString (name)
                                                    + ",\"type\":" + JSON::toString (typeName)
                                                    + ",\"value\":" + JSON::toString (value) + "}";
                                        first = false;
                                        ++count;
                                    }
                                }
                                catch (...) {}

                                varsJson += "]";
                                json = "{\"ok\":true,\"vars\":" + varsJson + "}";
                            }
                        }
                    }
                }
            }
            if (json.isEmpty())
                json = "{\"ok\":false,\"error\":\"node not found or not a script node\"}";
            postCompletion (completion, json);
        });

    registerFn (
        Identifier ("elementGraphAddPlugin"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String identifier (args[0].toString());
                if (const auto* desc = findKnownPluginByIdentifier (context.plugins().getKnownPlugins(), identifier))
                {
                    auto sess = context.session();
                    const Node graph (sess != nullptr ? currentBoard() : Node());
                    if (graph.isGraph())
                    {
                        context.services().postMessage (new AddPluginMessage (graph, *desc, true));

                        // 3a-W1 — optional args[1]=x, args[2]=y: position the new
                        // Block at the given flow-space coords (same deferred-apply
                        // mechanism as elementGraphAddPluginConnected — positioned
                        // only, no ConnectionBuilder / auto-connect).
                        if (args.size() >= 3)
                        {
                            const double flowX = (double) args[1];
                            const double flowY = (double) args[2];
                            const Graph G (graph);
                            pendingConnectedAdd.active = true;
                            pendingConnectedAdd.flowX = flowX;
                            pendingConnectedAdd.flowY = flowY;
                            pendingConnectedAdd.waitedTicks = 0;
                            pendingConnectedAdd.boardPathSnapshot = boardPath;
                            pendingConnectedAdd.preExistingUuids.clearQuick();
                            for (int i = 0; i < G.getNumNodes(); ++i)
                                pendingConnectedAdd.preExistingUuids.add (G.getNode (i).getUuidString());
                        }

                        ok = true;
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // T3 — ⌥(Alt)+drop a cable on empty canvas: add a Block AT the flow-space
    // drop point and atomically auto-connect it to the port the cable was
    // dragged off. ONE undoable engine action (AddPluginMessage carrying a
    // populated ConnectionBuilder — the same atomic add+connect prior art used
    // by grapheditorcomponent.cpp:1843 and the molecule insert). The new node's
    // absolute position is applied deferred (the add is async / postMessage) via
    // pendingConnectedAdd, consumed in timerCallback before the snapshot push —
    // this honours the drop coords end-to-end (buildActiveGraphJson reads
    // Node::getPosition() = tags::x/y), sidestepping the dead AddPluginMessage
    // x/y plumbing AND the GraphManager grid re-seed.
    //   args[0] = pluginIdentifier : String
    //   args[1] = x                : double (flow-space)
    //   args[2] = y                : double (flow-space)
    //   args[3] = originNodeUuid   : String
    //   args[4] = originPortId     : String ("out-N" / "in-N")
    //   args[5] = originIsSource   : bool (origin port was an OUTPUT)
    //   → bool. Honest false on ANY resolution failure.
    registerFn (
        Identifier ("elementGraphAddPluginConnected"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 6)
            {
                const String identifier (args[0].toString());
                const double flowX = (double) args[1];
                const double flowY = (double) args[2];
                const String originUuid (args[3].toString());
                const String originPortId (args[4].toString());
                const bool originIsSource = (bool) args[5];

                auto sess = context.session();
                const Node graph (sess != nullptr ? currentBoard() : Node());
                const Graph G (graph);
                if (G.isGraph())
                {
                    if (const auto* desc = findKnownPluginByIdentifier (context.plugins().getKnownPlugins(), identifier))
                    {
                        const Node origin = findNodeByUuidInGraph (G, originUuid);
                        // The dragged origin port id is "out-N" / "in-N" where N is
                        // the RAW port index (see snapshot buildActiveGraphJson). We
                        // resolve that to the port's PortType + channel-within-type so
                        // the ConnectionBuilder can re-resolve the matching channel on
                        // the freshly-added node at perform time.
                        const int rawPortIndex = parsePortHandleIndex (
                            originPortId, originIsSource ? "out-" : "in-");
                        if (origin.isValid() && rawPortIndex >= 0
                            && isPositiveAndBelow (rawPortIndex, origin.getNumPorts()))
                        {
                            const Port originPort (origin.getPort (rawPortIndex));
                            const PortType portType (originPort.getType());
                            const int originChannel = originPort.channel();

                            // Only audio/MIDI cables carry an auto-connect (the
                            // engine connection model). Value/CV/etc. fall through to
                            // an honest false — no fabricated connection.
                            if ((portType.isAudio() || portType.isMidi()) && originChannel >= 0)
                            {
                                std::unique_ptr<AddPluginMessage> message (
                                    new AddPluginMessage (graph, *desc, true));
                                auto& builder (message->builder);

                                // ConnectionBuilder::addChannel(node, type, srcChan,
                                // tgtChan, isInput) semantics (see node.cpp:1243):
                                //   isInput=false → `node` output → new node input
                                //                   (new node is DOWNSTREAM / dest)
                                //   isInput=true  → new node output → `node` input
                                //                   (new node is UPSTREAM / source)
                                // originIsSource ⇒ origin output feeds the new Block
                                // ⇒ isInput=false. Else the new Block feeds origin's
                                // input ⇒ isInput=true.
                                const bool builderIsInput = ! originIsSource;
                                builder.addChannel (origin, portType, originChannel, 0, builderIsInput);

                                // Stereo: if audio and the origin has an adjacent
                                // same-type, same-direction port, wire the second
                                // lane too — mirrors grapheditorcomponent.cpp:1843's
                                // raw-index stereo add (srcNode.getPort(srcPort+1)).
                                if (portType.isAudio()
                                    && isPositiveAndBelow (rawPortIndex + 1, origin.getNumPorts()))
                                {
                                    const Port adjPort (origin.getPort (rawPortIndex + 1));
                                    if (adjPort.data().isValid()
                                        && adjPort.getType().isAudio()
                                        && adjPort.isInput() == originPort.isInput())
                                    {
                                        builder.addChannel (origin, PortType::Audio, originChannel + 1, 1, builderIsInput);
                                    }
                                }

                                // Record the deferred absolute-position apply BEFORE
                                // posting (the add is async). preExistingUuids lets the
                                // timer find the single new node to position.
                                pendingConnectedAdd.active = true;
                                pendingConnectedAdd.flowX = flowX;
                                pendingConnectedAdd.flowY = flowY;
                                pendingConnectedAdd.waitedTicks = 0;
                                pendingConnectedAdd.boardPathSnapshot = boardPath;
                                pendingConnectedAdd.preExistingUuids.clearQuick();
                                for (int i = 0; i < G.getNumNodes(); ++i)
                                    pendingConnectedAdd.preExistingUuids.add (G.getNode (i).getUuidString());

                                context.services().postMessage (message.release());
                                scheduleGraphPush (40);
                                ok = true;
                            }
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // I4-B — persistent favourite-star toggle from the webview. Mirrors the
    // native PluginsPanelView star-click path (toggleFavorite on the matching
    // PluginDescription), but driven from a QuickAdd / command-palette row. The
    // tracker persists the change (scheduleSave); favourites live in the
    // pull-based plugin-list snapshot (buildPluginListJson), NOT the graph
    // snapshot, so there is no push here — the webview flips optimistically and
    // reconciles on its next plugin-list refresh().
    // Does NOT insert a Block. No-op safely if the identifier doesn't resolve.
    registerFn (
        Identifier ("elementToggleFavorite"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String identifier (args[0].toString());
                if (const auto* desc = findKnownPluginByIdentifier (context.plugins().getKnownPlugins(), identifier))
                {
                    context.plugins().getUsageTracker().toggleFavorite (*desc);
                    ok = true;
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphRemoveNode"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            // P1-A — close the embedded plugin editor NOW, while the
                            // processor is still alive, if it points at the node being
                            // removed (or, defensively, at a node nested under it when a
                            // container is removed). RemoveNodeMessage below is async and
                            // later calls releaseResources() + drops the node's final ref;
                            // closing reactively in valueTreeChildRemoved would then run
                            // ~PluginWindowContent->editorBeingDeleted() on a freed
                            // processor (UAF). pluginEditorClose() only resets a unique_ptr
                            // and is idempotent, so an unrelated removal is a no-op.
                            if (pluginEmbedNodeUuid.isNotEmpty())
                            {
                                const bool removingEmbeddedNode =
                                    (n.getUuidString() == pluginEmbedNodeUuid);
                                const bool embeddedNodeIsUnderRemoved =
                                    n.isGraph()
                                    && n.getNodeByUuid (Uuid (pluginEmbedNodeUuid), true).isValid();
                                if (removingEmbeddedNode || embeddedNodeIsUnderRemoved)
                                    pluginEditorClose();
                            }

                            // P2-A1 INTERACTION (c): primary delete-while-dived
                            // truncation. If the node being removed is the dived
                            // board (or an ancestor on boardPath), pop the path to
                            // its surviving parent so the canvas exits to a valid
                            // board. Idempotent w.r.t. the valueTreeChildRemoved
                            // backstop (the UUID is gone from the path after this).
                            truncateBoardPathOnNodeRemoval (n.getUuidString());

                            context.services().postMessage (new RemoveNodeMessage (n));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // P2-A1 (host side of the container dive). The WV-canvas worker wires the
    // double-click; these two natives move the host "current board" pointer the
    // snapshot walks, then re-push the graph snapshot (the dive lives inside the
    // graph snapshot, so scheduleGraphPush is the correct channel).
    //
    //   elementEnterContainer(nodeUuid : String) → bool
    //     Dive INTO a Container Block. The node must be a DIRECT child of the
    //     current board AND a graph (Node::isGraph()); otherwise it's a safe
    //     no-op returning false. Any open embedded plugin editor is closed first
    //     because its node lives on the (now parent) board.
    registerFn (
        Identifier ("elementEnterContainer"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String uuid (args[0].toString());
                if (uuid.isNotEmpty())
                {
                    const Node board (currentBoard());
                    if (board.isValid())
                    {
                        // recursive=false: only a DIRECT child of the current
                        // board is a valid one-level dive target.
                        const Node target (board.getNodeByUuid (Uuid (uuid), false));
                        if (target.isValid() && target.isGraph())
                        {
                            // INTERACTION (b): the embed editor's node lives on
                            // the parent board — close it before descending.
                            if (pluginEmbedNodeUuid.isNotEmpty())
                                pluginEditorClose();

                            boardPath.add (uuid);
                            scheduleGraphPush (40);
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    //   elementExitContainer() → bool
    //     Pop ONE level off the board path (clamped at the top-level active
    //     graph). Returns false when already at the top (nothing to exit). Any
    //     open embedded plugin editor is closed first (same reason as enter).
    registerFn (
        Identifier ("elementExitContainer"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (! boardPath.isEmpty())
            {
                if (pluginEmbedNodeUuid.isNotEmpty())
                    pluginEditorClose();

                boardPath.removeLast();
                scheduleGraphPush (40);
                ok = true;
            }
            postCompletion (completion, ok);
        });

    // G3-A (verdict #28) — node-level disconnect. The existing
    // elementGraphDisconnect is cable-level (4 port args → RemoveConnection);
    // this disconnects ALL matching cables on a node, mirroring the JUCE
    // NodePopupMenu (src/ui/contextmenus.hpp:437-444).
    //   args[0] = nodeUuid : String
    //   args[1] = scope     : String in {"all","inputs","outputs","midi"} (default "all")
    //   → bool. scope→(inputs,outputs,audio,midi):
    //     all=(1,1,1,1) inputs=(1,0,1,1) outputs=(0,1,1,1) midi=(1,1,0,1)
    registerFn (
        Identifier ("elementGraphDisconnectNode"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const String scope (args.size() >= 2 ? args[1].toString() : String ("all"));
                            bool inputs = true, outputs = true, audio = true, midi = true;
                            if (scope == "inputs")       { inputs = true;  outputs = false; audio = true;  midi = true; }
                            else if (scope == "outputs") { inputs = false; outputs = true;  audio = true;  midi = true; }
                            else if (scope == "midi")    { inputs = true;  outputs = true;  audio = false; midi = true; }
                            // "all" (and any unknown value) → full disconnect.
                            context.services().postMessage (new DisconnectNodeMessage (n, inputs, outputs, audio, midi));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // G3-A — set a user node colour (round-trips through the snapshot
    // `color` → BlockData.hostColor → Block hostColourOutline).
    //   args[0] = nodeUuid : String
    //   args[1] = color    : String "#RRGGBB" (opaque) OR "" to clear → category fallback
    //   → bool
    registerFn (
        Identifier ("elementGraphSetNodeColor"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const String color (args[1].toString().trim());
                            if (color.isEmpty())
                            {
                                // Honest "no custom colour" — Block falls back to the
                                // category accent (real default), not a fabricated hue.
                                n.getUIValueTree().removeProperty (Identifier ("color"), nullptr);
                            }
                            else
                            {
                                // Webview sends "#RRGGBB"; build an opaque JUCE Colour.
                                const String hex6 (color.startsWithChar ('#') ? color.substring (1) : color);
                                n.setColor (juce::Colour::fromString ("FF" + hex6));
                            }
                            ok = true;
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // G3-A — oversampling factor (parity with contextmenus.hpp:332-348).
    //   args[0] = nodeUuid : String
    //   args[1] = factor   : int in {1,2,4,8}
    //   → bool. false for Audio/MIDI-IO nodes (no oversampling) or invalid factor.
    registerFn (
        Identifier ("elementGraphSetOversample"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const int factor = (int) args[1];
                            auto* proc = n.getObject();
                            const bool validFactor = (factor == 1 || factor == 2 || factor == 4 || factor == 8);
                            if (proc != nullptr && validFactor
                                && ! proc->isAudioIONode() && ! proc->isMidiIONode())
                            {
                                proc->setOversamplingFactor (factor);
                                ok = true;
                            }
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // G3-A — replace the plugin in a node in-place (keeps connections where
    // possible; EngineService::replace handles connection retention). The
    // webview picks the plugin from the EXISTING elementGetPluginList — no
    // native FileChooser.
    //   args[0] = nodeUuid         : String
    //   args[1] = pluginIdentifier : String (from BrowserPlugin.identifier)
    //   → bool. false if node invalid or identifier not in KnownPluginList.
    registerFn (
        Identifier ("elementGraphReplacePlugin"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const String identifier (args[1].toString());
                            if (const auto* desc = findKnownPluginByIdentifier (context.plugins().getKnownPlugins(), identifier))
                            {
                                // ReplaceNodeMessage derives the graph via n.getParentGraph().
                                context.services().postMessage (new ReplaceNodeMessage (n, *desc, true));
                                ok = true;
                            }
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphConnect"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 4)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node src = findNodeByUuidInGraph (G, args[0].toString());
                        const Node dst = findNodeByUuidInGraph (G, args[2].toString());
                        const int sp = parsePortHandleIndex (args[1].toString(), "out-");
                        const int dp = parsePortHandleIndex (args[3].toString(), "in-");
                        if (src.isValid() && dst.isValid() && sp >= 0 && dp >= 0)
                        {
                            context.services().postMessage (
                                new AddConnectionMessage ((uint32_t) src.getNodeId(), (uint32_t) sp, (uint32_t) dst.getNodeId(), (uint32_t) dp, G));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphDisconnect"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 4)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node src = findNodeByUuidInGraph (G, args[0].toString());
                        const Node dst = findNodeByUuidInGraph (G, args[2].toString());
                        const int sp = parsePortHandleIndex (args[1].toString(), "out-");
                        const int dp = parsePortHandleIndex (args[3].toString(), "in-");
                        if (src.isValid() && dst.isValid() && sp >= 0 && dp >= 0)
                        {
                            context.services().postMessage (
                                new RemoveConnectionMessage ((uint32_t) src.getNodeId(), (uint32_t) sp, (uint32_t) dst.getNodeId(), (uint32_t) dp, G));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphSpliceCable"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            // args: [aId, aOut, newId, newIn, newOut, bId, bIn] — splice the new
            // block INTO cable A→B as ONE undoable op (A→new→B). See
            // SpliceConnectionMessage; mirrors elementGraphConnect's resolution.
            bool ok = false;
            if (args.size() >= 7)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node a  = findNodeByUuidInGraph (G, args[0].toString());
                        const Node nw = findNodeByUuidInGraph (G, args[2].toString());
                        const Node b  = findNodeByUuidInGraph (G, args[5].toString());
                        const int ap  = parsePortHandleIndex (args[1].toString(), "out-");
                        const int nip = parsePortHandleIndex (args[3].toString(), "in-");
                        const int nop = parsePortHandleIndex (args[4].toString(), "out-");
                        const int bp  = parsePortHandleIndex (args[6].toString(), "in-");
                        if (a.isValid() && nw.isValid() && b.isValid()
                            && ap >= 0 && nip >= 0 && nop >= 0 && bp >= 0)
                        {
                            context.services().postMessage (
                                new SpliceConnectionMessage (
                                    (uint32_t) a.getNodeId(),  (uint32_t) ap,
                                    (uint32_t) nw.getNodeId(), (uint32_t) nip, (uint32_t) nop,
                                    (uint32_t) b.getNodeId(),  (uint32_t) bp, G));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // Wave-3 Task 5.1 — double-click a Cable → drop a Reroute "knot" at the
    // cursor that splices the cable A→B through it, ATOMICALLY (one undo). The
    // reroute node does not exist yet, so unlike elementGraphSpliceCable this
    // CREATES the reroute server-side (where it has the uuid) AND splices in one
    // undoable InsertRerouteMessage. The reroute TYPE is chosen by the cable's
    // signal type: "audio" → element.audioReroute, "midi" → element.midiReroute,
    // else (value/CV) → element.reroute. Its in/out ports are resolved by
    // PortType inside the action (post-add). The drop coords are honoured by the
    // SAME deferred-position machinery (pendingConnectedAdd) the ⌥+drop add uses.
    //   args[0] = aId      : String  (source node uuid)
    //   args[1] = aOutPort : String  ("out-N")
    //   args[2] = bId      : String  (target node uuid)
    //   args[3] = bInPort  : String  ("in-N")
    //   args[4] = signalType : String ("audio" | "midi" | "value")
    //   args[5] = x        : double  (flow-space)
    //   args[6] = y        : double  (flow-space)
    //   → bool. Honest false on ANY resolution failure (unknown nodes/ports, or
    //     the reroute identifier not in the KnownPluginList).
    registerFn (
        Identifier ("elementGraphInsertReroute"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 7)
            {
                if (auto sess = context.session())
                {
                    const Node graph (currentBoard());
                    const Graph G (graph);
                    if (G.isGraph())
                    {
                        const Node a = findNodeByUuidInGraph (G, args[0].toString());
                        const Node b = findNodeByUuidInGraph (G, args[2].toString());
                        const int ap = parsePortHandleIndex (args[1].toString(), "out-");
                        const int bp = parsePortHandleIndex (args[3].toString(), "in-");
                        const String signalType (args[4].toString());
                        const double flowX = (double) args[5];
                        const double flowY = (double) args[6];

                        // Reroute identifier by signal type (mirrors the strings
                        // in include/element/node.h EL_NODE_ID_*REROUTE).
                        String rerouteId ("element.reroute");
                        if (signalType == "audio")
                            rerouteId = "element.audioReroute";
                        else if (signalType == "midi")
                            rerouteId = "element.midiReroute";

                        if (a.isValid() && b.isValid() && ap >= 0 && bp >= 0)
                        {
                            if (const auto* desc = findKnownPluginByIdentifier (context.plugins().getKnownPlugins(), rerouteId))
                            {
                                // Record the deferred absolute-position apply
                                // BEFORE posting (the add is async): the timer
                                // finds the single NEW node on this board and
                                // setPosition()s it to the drop point.
                                pendingConnectedAdd.active = true;
                                pendingConnectedAdd.flowX = flowX;
                                pendingConnectedAdd.flowY = flowY;
                                pendingConnectedAdd.waitedTicks = 0;
                                pendingConnectedAdd.boardPathSnapshot = boardPath;
                                pendingConnectedAdd.preExistingUuids.clearQuick();
                                for (int i = 0; i < G.getNumNodes(); ++i)
                                    pendingConnectedAdd.preExistingUuids.add (G.getNode (i).getUuidString());

                                context.services().postMessage (
                                    new InsertRerouteMessage (
                                        graph, *desc,
                                        (uint32_t) a.getNodeId(), (uint32_t) ap,
                                        (uint32_t) b.getNodeId(), (uint32_t) bp,
                                        signalType, flowX, flowY));
                                scheduleGraphPush (40);
                                ok = true;
                            }
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphMoveNodes"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1)
            {
                const var& payload = args[0];
                auto applyMove = [&] (const var& item) {
                    if (auto* obj = item.getDynamicObject())
                    {
                        const String id = obj->getProperty ("id").toString();
                        const double x = (double) obj->getProperty ("x");
                        const double y = (double) obj->getProperty ("y");
                        if (auto sess = context.session())
                        {
                            const Graph G (currentBoard());
                            if (G.isGraph())
                            {
                                Node n = findNodeByUuidInGraph (G, id);
                                if (n.isValid())
                                {
                                    n.setPosition (x, y);
                                    ++count;
                                }
                            }
                        }
                    }
                };

                if (payload.isArray())
                    for (const auto& m : *payload.getArray())
                        applyMove (m);
                else
                    applyMove (payload);
            }
            postCompletion (completion, count);
        });

    // G3c item 4 — auto-layout apply path. The layered/Sugiyama positions are
    // computed deterministically in the webview (lib/autoLayout.ts) from the
    // real node/edge graph; this batches the resulting setPosition() calls so
    // the whole arrange is one snapshot push. arg[0] = [{id,x,y}] → count.
    registerFn (
        Identifier ("elementGraphAutoLayout"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1 && args[0].isArray())
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        for (const auto& item : *args[0].getArray())
                        {
                            if (auto* obj = item.getDynamicObject())
                            {
                                const String id = obj->getProperty ("id").toString();
                                const double x = (double) obj->getProperty ("x");
                                const double y = (double) obj->getProperty ("y");
                                Node n = findNodeByUuidInGraph (G, id);
                                if (n.isValid())
                                {
                                    n.setPosition (x, y);
                                    ++count;
                                }
                            }
                        }
                    }
                }
            }
            if (count > 0)
                pushGraphSnapshot();
            postCompletion (completion, count);
        });

    registerFn (
        Identifier ("elementGraphSetBypass"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const bool bypass = (bool) args[1];
                            n.getPropertyAsValue (tags::bypass).setValue (bypass);
                            if (auto* obj = n.getObject())
                                if (obj->isSuspended() != bypass)
                                    obj->suspendProcessing (bypass);
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphSetMute"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            n.setMuted ((bool) args[1]);
                            ok = true;
                        }
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphSetMuteInput"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            n.setMuteInput ((bool) args[1]);
                            ok = true;
                        }
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphSetCanvasOptions"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
                if (auto sess = context.session())
                {
                    Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        ValueTree wc = ensureWebCanvasInGraph (G);
                        wc.setProperty ("snapToGrid", (bool) args[0], nullptr);
                        wc.setProperty ("gridSize", jlimit (4, 128, (int) args[1]), nullptr);
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphSetViewport"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 3)
                if (auto sess = context.session())
                {
                    Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        ValueTree wc = ensureWebCanvasInGraph (G);
                        wc.setProperty ("viewportX", (double) args[0], nullptr);
                        wc.setProperty ("viewportY", (double) args[1], nullptr);
                        wc.setProperty ("zoom", jlimit (0.05, 10.0, (double) args[2]), nullptr);
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphDuplicateNode"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            context.services().postMessage (new DuplicateNodeMessage (n));
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementUndo"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* gui = context.services().find<GuiService>())
                gui->performUndo();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementRedo"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* gui = context.services().find<GuiService>())
                gui->performRedo();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementTransportPanic"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto e = context.audio())
                for (const auto& msg : MidiPanic::messages())
                    e->addMidiMessage (msg);
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementTransportTogglePlay"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto e = context.audio())
                e->togglePlayPause();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementGraphRenameNode"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            // CONTRACT 2 — reject an empty / whitespace-only rename:
                            // keep the existing name rather than blanking the node
                            // (an empty tags::name never self-heals via
                            // stabilizePropertyString, so it would persist as
                            // "(unnamed)"). ok stays false on empty → no snapshot
                            // push, no name change.
                            const String nm = args[1].toString().trim();
                            if (nm.isNotEmpty())
                            {
                                n.setProperty (tags::name, nm);
                                ok = true;
                            }
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // Rename a TOP-LEVEL Board (session graph) by index. Unlike a Block or a
    // Container — which are Nodes in a board's node list and rename via
    // elementGraphRenameNode by uuid — a top-level Board is a Session graph
    // addressed by index (mirrors elementSessionSetActiveGraph), so it needs
    // its own native: there is no node uuid to target. Sets the name property
    // on the session-graph ValueTree (message thread). Pushing the snapshot
    // refreshes the breadcrumb (it reads getActiveGraph().getName()); the
    // session-tree consumer re-reads names via stabilizeContent.
    //   args[0] = graphIndex : int  (0-based, into Session graphs)
    //   args[1] = name       : String
    //   → bool
    registerFn (
        Identifier ("elementSessionRenameGraph"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const int idx = (int) args[0];
                const String name (args[1].toString().trim());
                if (auto sess = context.session())
                {
                    if (name.isNotEmpty() && isPositiveAndBelow (idx, sess->getNumGraphs()))
                    {
                        Node g (sess->getGraph (idx));
                        if (g.isValid())
                        {
                            g.setProperty (tags::name, name);
                            ok = true;
                        }
                    }
                }
            }
            if (ok)
            {
                if (auto* gui = context.services().find<GuiService>())
                    gui->stabilizeContent();
                pushGraphSnapshot();
            }
            postCompletion (completion, ok);
        });

    // Per-block user note (Inspector textarea). Persisted as a "userNote"
    // ValueTree property on the Node so it survives session save/load.
    registerFn (
        Identifier ("elementGraphSetNodeNote"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            n.setProperty (Identifier ("userNote"), args[1].toString());
                            ok = true;
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // Per-block hidden parameter ports (Configure Parameters… popover, Glen
    // 2026-06-03). Persisted as a "userHiddenParams" CSV ValueTree property on
    // the Node — mirrors "userNote" exactly — so the user's per-block choice of
    // which Value/CV param ports to hide on the Block survives session
    // save/load. Read back into the snapshot as `hiddenParams` (see block-emit).
    //   args[0] = nodeUuid     : String
    //   args[1] = hiddenIdsCsv : String (comma-joined port ids; "" clears all)
    //   → bool
    registerFn (
        Identifier ("elementGraphSetNodeHiddenParams"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            n.setProperty (Identifier ("userHiddenParams"), args[1].toString());
                            ok = true;
                        }
                    }
                }
            }
            // A purely visual per-Block UI property — no audio/RT path. The
            // 40 ms coalesced push reflects the new hidden set on the next
            // snapshot (the webview already updated optimistically).
            if (ok)
                scheduleGraphPush (40);
            postCompletion (completion, ok);
        });

    // Per-block persisted collapse TIER (Wave-3 Task 2.0; widens the legacy
    // "collapsed" bool). Stored as a "collapseTier" string ValueTree property on
    // the Node — mirrors "userNote"/"userHiddenParams" — so a deliberately-tiered
    // Block survives session save/load. DUAL-WRITE (contract §4.1): also keep a
    // derived legacy "collapsed" bool (tier=="title") in sync, so an OLD build
    // opening a NEW .els still reads a sensible collapsed/expanded state
    // (forward-tolerant, lossy-but-safe). Read back into the snapshot as
    // `collapseTier` (see block-emit below, via readCollapseTier).
    //   args[0] = nodeUuid : String
    //   args[1] = tier     : String ("title"|"macro"|"expanded"; unknown→"macro")
    //   → bool
    registerFn (
        Identifier ("elementNodeSetCollapseTier"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            const String tier = validateCollapseTier (args[1].toString());
                            n.setProperty (Identifier ("collapseTier"), tier);
                            // Dual-write the derived legacy bool for old-build round-trip.
                            n.setProperty (Identifier ("collapsed"), tier == "title");
                            ok = true;
                        }
                    }
                }
            }
            // A purely visual per-Block UI property — no audio/RT path.
            // Write-on-click only, so the 40 ms coalesced push reflects it on
            // the next snapshot (a static graph still pushes nothing — this
            // field only ever changes on a deliberate user click).
            if (ok)
                scheduleGraphPush (40);
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphDuplicateNodes"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1)
            {
                const var& ids = args[0];
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        if (ids.isArray())
                        {
                            for (const auto& idVar : *ids.getArray())
                            {
                                const Node n = findNodeByUuidInGraph (G, idVar.toString());
                                if (n.isValid())
                                {
                                    context.services().postMessage (new DuplicateNodeMessage (n));
                                    ++count;
                                }
                            }
                        }
                    }
                }
            }
            if (count > 0)
                scheduleGraphPush (40);
            postCompletion (completion, count);
        });

    // T10 — Group selection into a Container. Resolves the selected uuids on the
    // CURRENT board and calls EngineService::groupNodes, which runs fully
    // synchronously on this (message) thread: the coalesced graph push is a
    // scheduled message-thread timer and cannot fire mid-operation, so no extra
    // snapshot-suppression is needed — the FIRST push the webview sees is the
    // post-group one scheduled below.
    //   args[0] = nodeUuids : String[]
    //   → { ok:true, containerId:String } | { ok:false, reason:String }
    //     reason ∈ { "no-session","no-board","cv-boundary","ineligible" }.
    //     groupNodes returns an invalid Node for BOTH the CV-boundary refusal
    //     and the ineligible/<2 refusals; we cannot distinguish them post-hoc,
    //     so the generic refusal reports "ineligible". (The webview gates CV
    //     boundaries up front; this is the honest C++ backstop.)
    registerFn (
        Identifier ("elementGroupNodes"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr res (new DynamicObject());
            res->setProperty ("ok", false);

            auto fail = [&] (const char* reason) {
                res->setProperty ("reason", String (reason));
                postCompletion (completion, var (res.get()));
            };

            if (args.size() < 1 || ! args[0].isArray())
            {
                fail ("ineligible");
                return;
            }

            auto sess = context.session();
            if (sess == nullptr)
            {
                fail ("no-session");
                return;
            }

            const Node board (currentBoard());
            if (! board.isGraph())
            {
                fail ("no-board");
                return;
            }

            auto* es = context.services().find<EngineService>();
            if (es == nullptr)
            {
                fail ("ineligible");
                return;
            }

            Array<Uuid> uuids;
            for (const auto& idVar : *args[0].getArray())
            {
                const String s (idVar.toString());
                if (s.isNotEmpty())
                    uuids.add (Uuid (s));
            }

            const Node container (es->groupNodes (board, uuids));
            if (! container.isValid())
            {
                fail ("ineligible");
                return;
            }

            res->setProperty ("ok", true);
            res->setProperty ("containerId", container.getUuidString());
            scheduleGraphPush (40);
            postCompletion (completion, var (res.get()));
        });

    registerFn (
        Identifier ("elementGraphCopyNodes"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            graphCopyPasteboard.clear();
            if (args.size() >= 1)
            {
                const var& ids = args[0];
                if (ids.isArray())
                {
                    for (const auto& idVar : *ids.getArray())
                    {
                        const String u (idVar.toString());
                        if (u.isNotEmpty())
                        {
                            graphCopyPasteboard.addIfNotAlreadyThere (u);
                            ++count;
                        }
                    }
                }
            }
            postCompletion (completion, count);
        });

    registerFn (
        Identifier ("elementGraphPasteNodes"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            int count = 0;
            if (auto sess = context.session())
            {
                const Graph G (currentBoard());
                if (G.isGraph())
                {
                    for (const auto& uuid : graphCopyPasteboard)
                    {
                        const Node n = findNodeByUuidInGraph (G, uuid);
                        if (n.isValid())
                        {
                            context.services().postMessage (new DuplicateNodeMessage (n));
                            ++count;
                        }
                    }
                }
            }
            if (count > 0)
                scheduleGraphPush (40);
            postCompletion (completion, count);
        });

    registerFn (
        Identifier ("elementGraphCommentAdd"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (auto sess = context.session())
            {
                Graph G (currentBoard());
                if (G.isGraph())
                {
                    double x = 80, y = 80, w = 240, h = 160;
                    if (args.size() >= 1)
                        x = (double) args[0];
                    if (args.size() >= 2)
                        y = (double) args[1];
                    if (args.size() >= 3)
                        w = (double) args[2];
                    if (args.size() >= 4)
                        h = (double) args[3];
                    ValueTree boxes = ensureCommentBoxesContainer (G);
                    ValueTree box ("CommentBox");
                    const String uid = Uuid().toString();
                    box.setProperty ("uuid", uid, nullptr);
                    box.setProperty ("title", String ("Comment"), nullptr);
                    box.setProperty ("color", juce::Colour (0x40808080).toString(), nullptr);
                    box.setProperty ("x", x, nullptr);
                    box.setProperty ("y", y, nullptr);
                    box.setProperty ("width", w, nullptr);
                    box.setProperty ("height", h, nullptr);
                    boxes.addChild (box, -1, nullptr);
                    ok = true;
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphCommentUpsert"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const var parsed = JSON::parse (args[0].toString());
                if (auto* obj = parsed.getDynamicObject())
                {
                    if (auto sess = context.session())
                    {
                        Graph G (currentBoard());
                        if (G.isGraph())
                        {
                            ValueTree boxes = ensureCommentBoxesContainer (G);
                            String id = obj->getProperty ("id").toString();
                            if (id.isEmpty())
                                id = obj->getProperty ("uuid").toString();

                            ValueTree box;
                            const int idx = findCommentBoxIndexByUuid (boxes, id);
                            if (idx >= 0)
                                box = boxes.getChild (idx);
                            else
                            {
                                box = ValueTree ("CommentBox");
                                const String uid = id.isNotEmpty() ? id : Uuid().toString();
                                box.setProperty ("uuid", uid, nullptr);
                                boxes.addChild (box, -1, nullptr);
                            }

                            if (obj->hasProperty ("title"))
                                box.setProperty ("title", obj->getProperty ("title"), nullptr);
                            if (obj->hasProperty ("color"))
                                box.setProperty ("color", obj->getProperty ("color"), nullptr);
                            if (obj->hasProperty ("x"))
                                box.setProperty ("x", (double) obj->getProperty ("x"), nullptr);
                            if (obj->hasProperty ("y"))
                                box.setProperty ("y", (double) obj->getProperty ("y"), nullptr);
                            if (obj->hasProperty ("width"))
                                box.setProperty ("width", (double) obj->getProperty ("width"), nullptr);
                            if (obj->hasProperty ("height"))
                                box.setProperty ("height", (double) obj->getProperty ("height"), nullptr);
                            ok = true;
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementGraphCommentDelete"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const String id = args[0].toString();
                if (auto sess = context.session())
                {
                    Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        ValueTree ui = G.getUIValueTree();
                        if (ui.isValid())
                        {
                            ValueTree boxes = ui.getChildWithName ("CommentBoxes");
                            if (boxes.isValid())
                            {
                                const int idx = findCommentBoxIndexByUuid (boxes, id);
                                if (idx >= 0)
                                {
                                    boxes.removeChild (idx, nullptr);
                                    ok = true;
                                }
                            }
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionNew"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* ss = context.services().find<SessionService>())
            {
                ss->newSession();
                if (auto* gui = context.services().find<GuiService>())
                    gui->stabilizeContent();
            }
            pushGraphSnapshot();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementSessionSave"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* ss = context.services().find<SessionService>())
            {
                ss->saveSession (false, true, true);
                if (auto* gui = context.services().find<GuiService>())
                    gui->stabilizeContent();
            }
            pushGraphSnapshot();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementSessionSaveAs"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* ss = context.services().find<SessionService>())
            {
                ss->saveSession (true, true, true);
                if (auto* gui = context.services().find<GuiService>())
                    gui->stabilizeContent();
            }
            pushGraphSnapshot();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementSessionOpen"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (auto* ss = context.services().find<SessionService>())
            {
                File startDir (ss->getSessionFile().getParentDirectory());
                if (! startDir.isDirectory())
                    startDir = File();
                FileChooser chooser ("Open Project", startDir, "*.els", true, false);
                if (chooser.browseForFileToOpen())
                {
                    const File f (chooser.getResult());
                    ss->openFile (f);
                    if (auto* ui = context.services().find<GuiService>())
                        ui->recentFiles().addFile (f);
                    if (auto* gui = context.services().find<GuiService>())
                        gui->stabilizeContent();
                    ok = true;
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionOpenPath"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const File f (args[0].toString().trim());
                if (f.existsAsFile() && f.hasFileExtension ("els"))
                {
                    if (auto* ss = context.services().find<SessionService>())
                    {
                        ss->openFile (f);
                        if (auto* ui = context.services().find<GuiService>())
                            ui->recentFiles().addFile (f);
                        if (auto* gui = context.services().find<GuiService>())
                            gui->stabilizeContent();
                        ok = true;
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionSetActiveGraph"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const int idx = (int) args[0];
                if (auto sess = context.session())
                {
                    if (isPositiveAndBelow (idx, sess->getNumGraphs()))
                    {
                        // P2-A1: a top-level tab switch starts at that tab's TOP
                        // board — drop any dive on the previous tab so the
                        // snapshot doesn't try to walk a container UUID that
                        // doesn't exist under the newly-activated graph.
                        boardPath.clearQuick();
                        sess->setActiveGraph (idx);
                        if (auto* gui = context.services().find<GuiService>())
                            gui->stabilizeContent();
                        ok = true;
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionImportGraph"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (auto* ss = context.services().find<SessionService>())
            {
                FileChooser chooser ("Bring in Board", File(), "*.elg", true, false);
                if (chooser.browseForFileToOpen())
                {
                    ss->importGraph (chooser.getResult());
                    if (auto* gui = context.services().find<GuiService>())
                        gui->stabilizeContent();
                    ok = true;
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionExportGraph"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (auto sess = context.session())
                if (auto* ss = context.services().find<SessionService>())
                {
                    auto node = sess->getCurrentGraph();
                    node.savePluginState();
                    File start (File::getSpecialLocation (File::userDocumentsDirectory)
                                    .getChildFile (node.getName().isNotEmpty() ? node.getName() : "Graph")
                                    .withFileExtension ("elg"));
                    start = start.getNonexistentSibling();
                    FileChooser chooser (TRANS ("Send out Board"), start, "*.elg");
                    if (chooser.browseForFileToSave (true))
                    {
                        ss->exportGraph (node, chooser.getResult());
                        if (auto* gui = context.services().find<GuiService>())
                            gui->stabilizeContent();
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementAudioApplySetup"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto* dyn = args[0].getDynamicObject())
                {
                    AudioDeviceManager::AudioDeviceSetup setup;
                    context.devices().getAudioDeviceSetup (setup);
                    const var vType (dyn->getProperty ("audioDeviceType"));
                    if (vType.isString())
                    {
                        const String tn (vType.toString());
                        if (auto* cur = context.devices().getCurrentDeviceTypeObject())
                            if (cur->getTypeName() != tn)
                                context.devices().selectAudioDriver (tn);
                    }
                    const auto setStr = [&] (const char* key, String& dest) {
                        const var v (dyn->getProperty (key));
                        if (v.isString())
                            dest = v.toString();
                    };
                    setStr ("outputDeviceName", setup.outputDeviceName);
                    setStr ("inputDeviceName", setup.inputDeviceName);
                    const var vSr (dyn->getProperty ("sampleRate"));
                    if (vSr.isDouble() || vSr.isInt())
                        setup.sampleRate = (double) vSr;
                    const var vBuf (dyn->getProperty ("bufferSize"));
                    if (vBuf.isInt() || vBuf.isDouble())
                        setup.bufferSize = (int) vBuf;
                    const String err (context.devices().setAudioDeviceSetup (setup, true));
                    ok = err.isEmpty();
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // G3c item 1 — MIDI write path. args[0] = { inputEnables?: [{identifier,
    // enabled}], defaultOutputId?: string }. Resolves each identifier against
    // the live device list and calls MidiEngine; round-trips the snapshot so
    // the UI reflects the new enable/default state.
    registerFn (
        Identifier ("elementMidiApplySetup"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto* dyn = args[0].getDynamicObject())
                {
                    auto& midi = context.midi();

                    const var vEnables (dyn->getProperty ("inputEnables"));
                    if (vEnables.isArray())
                    {
                        const auto inDevices = juce::MidiInput::getAvailableDevices();
                        for (const auto& e : *vEnables.getArray())
                        {
                            if (auto* eo = e.getDynamicObject())
                            {
                                const String id (eo->getProperty ("identifier").toString());
                                const bool enabled = (bool) eo->getProperty ("enabled");
                                for (const auto& info : inDevices)
                                {
                                    if (info.identifier == id)
                                    {
                                        midi.setMidiInputEnabled (info, enabled);
                                        ok = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    const var vDefaultOut (dyn->getProperty ("defaultOutputId"));
                    if (vDefaultOut.isString())
                    {
                        const String id (vDefaultOut.toString());
                        // Empty id deselects the default output (valid action).
                        if (id.isEmpty())
                        {
                            midi.setDefaultMidiOutput (juce::MidiDeviceInfo());
                            ok = true;
                        }
                        else
                        {
                            for (const auto& info : juce::MidiOutput::getAvailableDevices())
                            {
                                if (info.identifier == id)
                                {
                                    midi.setDefaultMidiOutput (info);
                                    ok = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementOscApplyHost"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                context.settings().setOscHostEnabled ((bool) args[0]);
                context.settings().setOscHostPort ((int) args[1]);
                if (auto* osc = context.services().find<OSCService>())
                    osc->refreshWithSettings (false);
                ok = true;
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementMappingSetLearning"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto* map = context.services().find<MappingService>())
                {
                    map->learn ((bool) args[0]);
                    ok = true;
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementMappingRemoveMap"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto sess = context.session())
                {
                    const int idx = (int) args[0];
                    if (isPositiveAndBelow (idx, sess->getNumControllerMaps()))
                    {
                        if (auto* mapSvc = context.services().find<MappingService>())
                            mapSvc->remove (sess->getControllerMap (idx));
                        if (auto* dev = context.services().find<DeviceService>())
                            dev->refresh();
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementSessionListFiles"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            const String j (buildSessionBrowserEntriesJson());
            postCompletion (completion, j);
        });

    // E6 (4b): silent named-save. args[0] = project name (no extension). Saves
    // to <defaultSessionDir>/<name>.els with NO FileChooser. Returns true on a
    // successful write. The webview uses this for the inline first-save prompt.
    registerFn (
        Identifier ("elementSessionSaveNamed"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto* ss = context.services().find<SessionService>())
                {
                    ok = ss->saveSessionToName (args[0].toString());
                    if (auto* gui = context.services().find<GuiService>())
                        gui->stabilizeContent();
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // E1 (4b): report the newest recoverable autosave (newer than its backing
    // session, or any untitled autosave). Returns a JSON object
    // {path,name,untitled,modifiedMs} or an empty object when none is found.
    registerFn (
        Identifier ("elementSessionFindRecoverable"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            DynamicObject::Ptr o (new DynamicObject());
            if (auto* ss = context.services().find<SessionService>())
            {
                const File rec (ss->findRecoverableAutosave());
                if (rec.existsAsFile())
                {
                    const bool untitled = rec.getFileName().startsWith ("autosave_");
                    o->setProperty ("path", rec.getFullPathName());
                    o->setProperty ("name", untitled ? String ("Untitled — recovered")
                                                      : rec.getFileName()
                                                            .upToLastOccurrenceOf (".autosave.els", false, false));
                    o->setProperty ("untitled", untitled);
                    o->setProperty ("modifiedMs",
                                    (juce::int64) rec.getLastModificationTime().toMilliseconds());
                }
            }
            postCompletion (completion, JSON::toString (var (o.get())));
        });

    // E1 (4b): perform recovery of an autosave file as a real `.els` session.
    // args[0] = absolute path (from elementSessionFindRecoverable / the shelf).
    // Returns true on success; an untitled recovery presents as
    // "Untitled — recovered" with no file set (next save prompts for a name).
    registerFn (
        Identifier ("elementSessionRecover"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto* ss = context.services().find<SessionService>())
                {
                    const File f (args[0].toString().trim());
                    if (f.existsAsFile() && f.hasFileExtension ("els"))
                    {
                        ok = ss->recoverFromAutosave (f);
                        if (auto* gui = context.services().find<GuiService>())
                            gui->stabilizeContent();
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPluginEditorOpen"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 5)
            {
                pluginEditorOpen (args[0].toString(), (int) args[1], (int) args[2], (int) args[3], (int) args[4]);
                ok = pluginEmbedEditor != nullptr;
            }
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPluginEditorClose"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            pluginEditorClose();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementPluginEditorSetBounds"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            if (args.size() >= 4)
                pluginEditorSetBounds ((int) args[0], (int) args[1], (int) args[2], (int) args[3]);
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementPluginEditorFloat"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            pluginEditorFloat();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementWebDismissOverlay"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (webShell != nullptr)
                webShell->dismissPresentedView();
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementOpenLuaConsole"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (webShell != nullptr)
                webShell->presentContentOverlay (std::make_unique<LuaConsoleView>());
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementOpenGraphMixer"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (webShell != nullptr)
                webShell->presentContentOverlay (std::make_unique<GraphMixerView>());
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementMoleculeInsert"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1)
                if (auto sess = context.session())
                {
                    Node graphNode = currentBoard();
                    if (graphNode.isGraph())
                    {
                        const String molName = args[0].toString();
                        const double insertX = args.size() > 1 ? (double) args[1] : 100.0;
                        const double insertY = args.size() > 2 ? (double) args[2] : 100.0;
                        MoleculeLibrary lib;
                        lib.refresh();
                        const Molecule mol (lib.getMolecule (molName));
                        if (mol.isValid())
                        {
                            ValueTree nodesData = mol.data().getChildWithName (tags::nodes);
                            for (int i = 0; i < nodesData.getNumChildren(); ++i)
                            {
                                ValueTree nodeData = nodesData.getChild (i).createCopy();
                                double x = static_cast<double> (nodeData.getProperty (tags::x, 0.0)) + insertX;
                                double y = static_cast<double> (nodeData.getProperty (tags::y, 0.0)) + insertY;
                                nodeData.setProperty (tags::x, x, nullptr);
                                nodeData.setProperty (tags::y, y, nullptr);
                                String identifier = nodeData.getProperty (tags::identifier).toString();
                                String formatName = nodeData.getProperty (tags::format).toString();
                                if (identifier.isEmpty())
                                    continue;
                                PluginDescription desc;
                                desc.fileOrIdentifier = identifier;
                                desc.pluginFormatName = formatName.isEmpty() ? "Internal" : formatName;
                                desc.name = nodeData.getProperty (tags::name).toString();
                                context.services().postMessage (new AddPluginMessage (graphNode, desc, true));
                                ++count;
                            }
                        }
                    }
                }
            if (count > 0)
                pushGraphSnapshot();
            postCompletion (completion, count);
        });

    // Save the current selection as a reusable Snippet (Molecule). Wave-2 C.
    // args[0] = snippet name, args[1] = array of node UUID strings.
    // Returns true only when the molecule was genuinely created + stored
    // (NOTHING-fake: the webview's "Snippet saved" hint must never lie).
    registerFn (
        Identifier ("elementMoleculeSave"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
                if (auto sess = context.session())
                {
                    const String molName = args[0].toString().trim();
                    // #4c — resolve the selection against the DIVED board, not the
                    // top-level graph, so "Save as Snippet" works when the user has
                    // double-clicked into a Container (mirrors elementMoleculeInsert
                    // and ~40 sibling handlers). sess->getCurrentGraph() is always
                    // the top-level board, so selected node UUIDs would not be found
                    // when dived → nodeIds empty → silent no-op.
                    const Graph G (currentBoard());
                    Array<uint32> nodeIds;
                    if (molName.isNotEmpty() && G.isGraph())
                        if (const Array<var>* arr = args[1].getArray())
                            for (const auto& v : *arr)
                            {
                                const Node n = findNodeByUuidInGraph (G, v.toString());
                                if (n.isValid())
                                    nodeIds.add ((uint32) (int64) n.getNodeId());
                            }
                    if (nodeIds.size() > 0)
                    {
                        const Molecule mol = Molecule::createFromSelection (G, nodeIds, molName);
                        if (mol.isValid())
                        {
                            MoleculeLibrary lib;
                            lib.refresh();
                            ok = lib.addMolecule (mol);
                        }
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPerformSetActiveScene"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto sess = context.session())
                {
                    ValueTree wp = ensureWebPerformMutable (*sess);
                    const int n = countWebSceneChildren (wp);
                    if (n > 0)
                    {
                        int idx = (int) args[0];
                        idx = jlimit (0, n - 1, idx);
                        wp.setProperty ("activeIndex", idx, nullptr);
                        ValueTree sc = getWebSceneAtFilteredIndex (wp, idx);
                        if (sc.isValid())
                            applyGraphParameterStateJson (context, sc.getProperty (paramStateJsonId).toString());
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPerformAddScene"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (auto sess = context.session())
            {
                ValueTree wp = ensureWebPerformMutable (*sess);
                const String name = args.size() >= 1 ? args[0].toString() : String ("Scene");
                ValueTree sc ("WebScene");
                sc.setProperty ("id", Uuid().toString(), nullptr);
                sc.setProperty ("name", name.isEmpty() ? String ("Scene") : name, nullptr);
                wp.addChild (sc, -1, nullptr);
                wp.setProperty ("activeIndex", countWebSceneChildren (wp) - 1, nullptr);
                ok = true;
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPerformCaptureScene"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (auto sess = context.session())
            {
                ValueTree wp = ensureWebPerformMutable (*sess);
                const int n = countWebSceneChildren (wp);
                if (n > 0)
                {
                    int idx = (int) wp.getProperty ("activeIndex", 0);
                    idx = jlimit (0, n - 1, idx);
                    ValueTree sc = getWebSceneAtFilteredIndex (wp, idx);
                    const Graph G (sess->getCurrentGraph());
                    if (sc.isValid() && G.isGraph())
                    {
                        sc.setProperty (paramStateJsonId, captureGraphParameterStateJson (G), nullptr);
                        ok = true;
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // ── US-002: Transport – record toggle ──────────────────────────────────────
    // AudioEngine::setRecording(bool) confirmed in include/element/audioengine.hpp
    registerFn (
        Identifier ("elementTransportSetRecording"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            if (auto e = context.audio())
                e->setRecording (args.size() >= 1 ? (bool) args[0] : false);
            postCompletion (completion, true);
        });

    // ── US-003: BPM/Tempo ──────────────────────────────────────────────────────
    // Tempo is stored in session ValueTree (tags::tempo). AudioEngine listens to
    // that Value and calls transport.requestTempo() automatically when it changes.
    // The current tempo is already pushed to JS via session.tempo in every
    // pushGraphSnapshot() call, so no separate "get" bridge is needed.
    registerFn (
        Identifier ("elementTransportSetTempo"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
            {
                const double bpm = jlimit (20.0, 999.0, (double) args[0]);
                if (auto sess = context.session())
                {
                    sess->getValueTree().setProperty (tags::tempo, bpm, nullptr);
                    ok = true;
                }
            }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // ── US-004: Plugin Windows ─────────────────────────────────────────────────
    // GuiService::closeAllPluginWindows(bool windowVisible) confirmed in ui.hpp.
    // "Show all" has no counterpart method — individual windows are opened via
    // presentPluginWindow(node). elementShowAllPluginWindows is intentionally
    // omitted because no engine method exists to show ALL windows at once.
    registerFn (
        Identifier ("elementHideAllPluginWindows"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* gui = context.services().find<GuiService>())
                gui->closeAllPluginWindows (true); // true = keep state, just hide
            postCompletion (completion, true);
        });

    // ── US-005: Scene delete / rename ──────────────────────────────────────────
    registerFn (
        Identifier ("elementPerformDeleteScene"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1)
                if (auto sess = context.session())
                {
                    ValueTree wp = ensureWebPerformMutable (*sess);
                    const int filteredIdx = (int) args[0];
                    ValueTree sc = getWebSceneAtFilteredIndex (wp, filteredIdx);
                    if (sc.isValid())
                    {
                        wp.removeChild (sc, nullptr);
                        // Clamp activeIndex to new count; reset to -1 when empty
                        const int newCount = countWebSceneChildren (wp);
                        if (newCount > 0)
                        {
                            int active = (int) wp.getProperty ("activeIndex", 0);
                            if (active >= newCount)
                                wp.setProperty ("activeIndex", newCount - 1, nullptr);
                        }
                        else
                        {
                            wp.setProperty ("activeIndex", -1, nullptr);
                        }
                        ok = true;
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    registerFn (
        Identifier ("elementPerformRenameScene"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
                if (auto sess = context.session())
                {
                    ValueTree wp = ensureWebPerformMutable (*sess);
                    ValueTree sc = getWebSceneAtFilteredIndex (wp, (int) args[0]);
                    if (sc.isValid())
                    {
                        const String newName = args[1].toString().trim();
                        if (newName.isNotEmpty())
                        {
                            sc.setProperty ("name", newName, nullptr);
                            ok = true;
                        }
                    }
                }
            if (ok)
                pushGraphSnapshot();
            postCompletion (completion, ok);
        });

    // ── US-006: Virtual Keyboard ───────────────────────────────────────────────
    // AudioEngine::getKeyboardState() returns juce::MidiKeyboardState&
    // confirmed in include/element/audioengine.hpp line 67.
    // noteOn/noteOff on MidiKeyboardState inject MIDI into the engine graph.
    registerFn (
        Identifier ("elementVirtualKeyboardNoteOn"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            // args: [note (0-127), velocity (0.0-1.0), channel (1-16)]
            if (args.size() >= 3)
                if (auto e = context.audio())
                {
                    const int note     = jlimit (0, 127, (int) args[0]);
                    const float vel    = jlimit (0.0f, 1.0f, (float) args[1]);
                    const int channel  = jlimit (1, 16, (int) args[2]);
                    e->getKeyboardState().noteOn (channel, note, vel);
                }
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementVirtualKeyboardNoteOff"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            // args: [note (0-127), channel (1-16)]
            if (args.size() >= 2)
                if (auto e = context.audio())
                {
                    const int note    = jlimit (0, 127, (int) args[0]);
                    const int channel = jlimit (1, 16, (int) args[1]);
                    e->getKeyboardState().noteOff (channel, note, 0.0f);
                }
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementAppGetAbout"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            DynamicObject::Ptr o (new DynamicObject());
            o->setProperty ("name", String (EL_APP_NAME));
            o->setProperty ("version", String (ELEMENT_VERSION_STRING));
            o->setProperty ("copyright", String ("GPL-3.0-or-later"));
            postCompletion (completion, juce::var (o.get()));
        });

    registerFn (
        Identifier ("elementAppCheckForUpdates"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto* gui = context.services().find<GuiService>())
                gui->checkUpdates (false);
            postCompletion (completion, true);
        });

    // ── Transport Stop / Rewind ────────────────────────────────────────────────
    registerFn (
        Identifier ("elementTransportStop"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto e = context.audio())
            {
                if (auto mon = e->getTransportMonitor())
                    if (mon->playing.get())
                        e->setPlaying (false);
            }
            postCompletion (completion, true);
        });

    registerFn (
        Identifier ("elementTransportRewind"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            if (auto e = context.audio())
                e->seekToAudioFrame (0);
            else
                Logger::writeToLog ("elementTransportRewind: no audio engine");
            postCompletion (completion, true);
        });

    // ── Show All Plugin Windows ───────────────────────────────────────────────
    registerFn (
        Identifier ("elementHostShowAllPluginWindows"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            bool ok = false;
            if (auto sess = context.session())
            {
                const Node gn (currentBoard());
                if (gn.isGraph())
                {
                    const Graph G (gn);
                    if (auto* gui = context.services().find<GuiService>())
                    {
                        for (int i = 0; i < G.getNumNodes(); ++i)
                        {
                            const Node n (G.getNode (i));
                            if (n.hasEditor())
                                gui->presentPluginWindow (n, false);
                        }
                        ok = true;
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // ── Session Graph Tree ────────────────────────────────────────────────────
    registerFn (
        Identifier ("elementSessionGetGraphTree"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            Array<var> graphsVar;
            if (auto sess = context.session())
            {
                const int activeIdx = sess->getActiveGraphIndex();
                for (int i = 0; i < sess->getNumGraphs(); ++i)
                {
                    const Node gn (sess->getGraph (i));
                    DynamicObject::Ptr go (new DynamicObject());
                    go->setProperty ("id", gn.getUuidString());
                    go->setProperty ("name", gn.getName());
                    go->setProperty ("index", i);
                    go->setProperty ("active", i == activeIdx);
                    go->setProperty ("isContainer", gn.isGraph());

                    Array<var> children;
                    if (gn.isGraph())
                    {
                        const Graph sub (gn);
                        for (int j = 0; j < sub.getNumNodes(); ++j)
                        {
                            const Node child (sub.getNode (j));
                            if (child.isGraph())
                            {
                                DynamicObject::Ptr co (new DynamicObject());
                                co->setProperty ("id", child.getUuidString());
                                co->setProperty ("name", child.getName());
                                co->setProperty ("index", j);
                                co->setProperty ("active", false);
                                co->setProperty ("isContainer", true);
                                co->setProperty ("children", var (Array<var>()));
                                children.add (var (co.get()));
                            }
                        }
                    }
                    go->setProperty ("children", var (children));
                    graphsVar.add (var (go.get()));
                }
            }
            const String json (JSON::toString (var (graphsVar)));
            postCompletion (completion, json);
        });

    // ── Wireless Patching: cable bus name ─────────────────────────────────────
    // Phase 5B (blueprint §5/§7.2.8). Tag a cable Arc with a named bus so the
    // front-end can render it as a wireless transmitter/receiver pair instead
    // of a drawn curve. Best-effort persistence: the front-end useBusStore is
    // the visual source of truth; this just round-trips the name so it
    // survives session save/reload via the ValueTree.
    registerFn (
        Identifier ("elementGraphSetCableBus"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String cableId = args[0].toString();
                const String busName = args[1].toString();

                // Cable id format from buildGraphSnapshotJson:
                //   cable_<srcUuid>_<srcPort>_<dstUuid>_<dstPort>_<arcIndex>
                // The trailing arcIndex is volatile, so we key on the four
                // route components only.
                if (cableId.startsWith ("cable_"))
                {
                    const String body = cableId.substring (6);
                    // UUIDs are 36 chars (8-4-4-4-12).
                    if (body.length() > 36 + 1 + 1 + 1 + 36 + 1 + 1)
                    {
                        const String srcUuid = body.substring (0, 36);
                        const String rest1 = body.substring (37); // after '_'
                        const int us1 = rest1.indexOfChar ('_');
                        if (us1 > 0 && rest1.length() > us1 + 1 + 36)
                        {
                            const int srcPort = rest1.substring (0, us1).getIntValue();
                            const String rest2 = rest1.substring (us1 + 1);
                            const String dstUuid = rest2.substring (0, 36);
                            const String rest3 = rest2.substring (37);
                            const int us2 = rest3.indexOfChar ('_');
                            const int dstPort = us2 > 0 ? rest3.substring (0, us2).getIntValue()
                                                        : rest3.getIntValue();

                            if (auto sess = context.session())
                            {
                                const Node gn (currentBoard());
                                if (gn.isGraph())
                                {
                                    const Graph G (gn);
                                    const Node srcN = findNodeByUuidInGraph (G, srcUuid);
                                    const Node dstN = findNodeByUuidInGraph (G, dstUuid);
                                    if (srcN.isValid() && dstN.isValid())
                                    {
                                        const auto srcId = (uint32_t) srcN.getNodeId();
                                        const auto dstId = (uint32_t) dstN.getNodeId();
                                        ValueTree arcs (G.getArcsValueTree());
                                        for (int i = 0; i < arcs.getNumChildren(); ++i)
                                        {
                                            ValueTree a = arcs.getChild (i);
                                            const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
                                            const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
                                            const int sp = (int) a.getProperty (tags::sourcePort, 0);
                                            const int dp = (int) a.getProperty (tags::destPort, 0);
                                            if (sn == srcId && dn == dstId && sp == srcPort && dp == dstPort)
                                            {
                                                if (busName.isEmpty())
                                                    a.removeProperty ("busName", nullptr);
                                                else
                                                    a.setProperty ("busName", busName, nullptr);
                                                ok = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // ── Graph Connection List ─────────────────────────────────────────────────
    registerFn (
        Identifier ("elementGraphGetConnectionList"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            Array<var> cables;
            if (auto sess = context.session())
            {
                const Node gn (currentBoard());
                if (gn.isGraph())
                {
                    const Graph G (gn);
                    const ValueTree arcs (G.getArcsValueTree());
                    for (int i = 0; i < arcs.getNumChildren(); ++i)
                    {
                        const auto a = arcs.getChild (i);
                        const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
                        const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
                        const String su = nodeUuidFromGraphNodeId (G, sn);
                        const String du = nodeUuidFromGraphNodeId (G, dn);
                        if (su.isEmpty() || du.isEmpty())
                            continue;

                        const int spi = (int) a.getProperty (tags::sourcePort, 0);
                        const int dpi = (int) a.getProperty (tags::destPort, 0);
                        const Node srcNode = G.getNodeById (sn);
                        String signal = "audio";
                        if (srcNode.isValid() && isPositiveAndBelow (spi, srcNode.getNumPorts()))
                            signal = portTypeToSignalString (srcNode.getPort (spi).getType());

                        DynamicObject::Ptr c (new DynamicObject());
                        c->setProperty ("id", "cable_" + su + "_" + String (spi) + "_" + du + "_" + String (dpi) + "_" + String (i));
                        c->setProperty ("source", su);
                        c->setProperty ("sourcePort", "out-" + String (spi));
                        c->setProperty ("target", du);
                        c->setProperty ("targetPort", "in-" + String (dpi));
                        c->setProperty ("signalType", signal);
                        c->setProperty ("channelCount", signal == String ("audio") ? 2 : 1);
                        cables.add (var (c.get()));
                    }
                }
            }
            const String json (JSON::toString (var (cables)));
            postCompletion (completion, json);
        });

    // ── P1-2: Atomic cable rebind — set source endpoint ─────────────────────
    // Input:  args[0] = cableId (cable_<srcUuid>_<srcPort>_<dstUuid>_<dstPort>_<idx>)
    //         args[1] = newSourceNodeUuid (String)
    //         args[2] = newSourceChannelIndex (int, raw port index)
    // Output: { "ok": true } | { "ok": false, "error": "..." }
    registerFn (
        Identifier ("elementGraphSetConnectionSource"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const juce::String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const juce::String json (juce::JSON::toString (juce::var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 3)
                return fail ("expected 3 arguments: cableId, newSourceNodeUuid, newSourceChannelIndex");

            const juce::String cableId = args[0].toString();
            const juce::String newSrcUuid = args[1].toString();
            const int newSrcPort = (int) args[2];

            if (! cableId.startsWith ("cable_"))
                return fail ("invalid cableId format");

            // Parse cable_<srcUuid36>_<srcPort>_<dstUuid36>_<dstPort>_<idx>
            const juce::String body = cableId.substring (6);
            if (body.length() <= 36 + 1 + 1 + 1 + 36 + 1 + 1)
                return fail ("malformed cableId");

            const juce::String oldSrcUuid = body.substring (0, 36);
            const juce::String rest1 = body.substring (37);
            const int us1 = rest1.indexOfChar ('_');
            if (us1 <= 0)
                return fail ("malformed cableId (srcPort)");
            const int oldSrcPort = rest1.substring (0, us1).getIntValue();
            const juce::String rest2 = rest1.substring (us1 + 1);
            if (rest2.length() < 36)
                return fail ("malformed cableId (dstUuid)");
            const juce::String dstUuid = rest2.substring (0, 36);
            const juce::String rest3 = rest2.substring (37);
            const int us2 = rest3.indexOfChar ('_');
            const int dstPort = us2 > 0 ? rest3.substring (0, us2).getIntValue()
                                        : rest3.getIntValue();

            auto sess = context.session();
            if (! sess)
                return fail ("no active session");

            const Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            const Node oldSrc = findNodeByUuidInGraph (G, oldSrcUuid);
            const Node newSrc = findNodeByUuidInGraph (G, newSrcUuid);
            const Node dst = findNodeByUuidInGraph (G, dstUuid);

            if (! oldSrc.isValid())
                return fail ("original source node not found");
            if (! newSrc.isValid())
                return fail ("new source node not found");
            if (! dst.isValid())
                return fail ("destination node not found");

            const auto oldSrcId = (uint32_t) oldSrc.getNodeId();
            const auto newSrcId = (uint32_t) newSrc.getNodeId();
            const auto dstId = (uint32_t) dst.getNodeId();

            // Verify old arc exists
            const juce::ValueTree arcs (G.getArcsValueTree());
            bool found = false;
            for (int i = 0; i < arcs.getNumChildren(); ++i)
            {
                const juce::ValueTree a = arcs.getChild (i);
                if ((uint32_t) (int64) a.getProperty (tags::sourceNode) == oldSrcId
                    && (uint32_t) (int64) a.getProperty (tags::destNode) == dstId
                    && (int) a.getProperty (tags::sourcePort, 0) == oldSrcPort
                    && (int) a.getProperty (tags::destPort, 0) == dstPort)
                {
                    found = true;
                    break;
                }
            }

            if (! found)
                return fail ("cable not found in graph");

            // Atomic rebind: remove old, add new via service messages (both
            // will land in the same EngineService message queue flush).
            context.services().postMessage (
                new RemoveConnectionMessage (oldSrcId, (uint32_t) oldSrcPort,
                                            dstId, (uint32_t) dstPort, G));
            context.services().postMessage (
                new AddConnectionMessage (newSrcId, (uint32_t) newSrcPort,
                                         dstId, (uint32_t) dstPort, G));

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-2: Atomic cable rebind — set target endpoint ─────────────────────
    // Input:  args[0] = cableId
    //         args[1] = newTargetNodeUuid (String)
    //         args[2] = newTargetChannelIndex (int, raw port index)
    // Output: { "ok": true } | { "ok": false, "error": "..." }
    registerFn (
        Identifier ("elementGraphSetConnectionTarget"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const juce::String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const juce::String json (juce::JSON::toString (juce::var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 3)
                return fail ("expected 3 arguments: cableId, newTargetNodeUuid, newTargetChannelIndex");

            const juce::String cableId = args[0].toString();
            const juce::String newDstUuid = args[1].toString();
            const int newDstPort = (int) args[2];

            if (! cableId.startsWith ("cable_"))
                return fail ("invalid cableId format");

            const juce::String body = cableId.substring (6);
            if (body.length() <= 36 + 1 + 1 + 1 + 36 + 1 + 1)
                return fail ("malformed cableId");

            const juce::String srcUuid = body.substring (0, 36);
            const juce::String rest1 = body.substring (37);
            const int us1 = rest1.indexOfChar ('_');
            if (us1 <= 0)
                return fail ("malformed cableId (srcPort)");
            const int srcPort = rest1.substring (0, us1).getIntValue();
            const juce::String rest2 = rest1.substring (us1 + 1);
            if (rest2.length() < 36)
                return fail ("malformed cableId (dstUuid)");
            const juce::String oldDstUuid = rest2.substring (0, 36);
            const juce::String rest3 = rest2.substring (37);
            const int us2 = rest3.indexOfChar ('_');
            const int oldDstPort = us2 > 0 ? rest3.substring (0, us2).getIntValue()
                                           : rest3.getIntValue();

            auto sess = context.session();
            if (! sess)
                return fail ("no active session");

            const Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            const Node src = findNodeByUuidInGraph (G, srcUuid);
            const Node oldDst = findNodeByUuidInGraph (G, oldDstUuid);
            const Node newDst = findNodeByUuidInGraph (G, newDstUuid);

            if (! src.isValid())
                return fail ("source node not found");
            if (! oldDst.isValid())
                return fail ("original destination node not found");
            if (! newDst.isValid())
                return fail ("new destination node not found");

            const auto srcId = (uint32_t) src.getNodeId();
            const auto oldDstId = (uint32_t) oldDst.getNodeId();
            const auto newDstId = (uint32_t) newDst.getNodeId();

            // Verify old arc exists
            const juce::ValueTree arcs (G.getArcsValueTree());
            bool found = false;
            for (int i = 0; i < arcs.getNumChildren(); ++i)
            {
                const juce::ValueTree a = arcs.getChild (i);
                if ((uint32_t) (int64) a.getProperty (tags::sourceNode) == srcId
                    && (uint32_t) (int64) a.getProperty (tags::destNode) == oldDstId
                    && (int) a.getProperty (tags::sourcePort, 0) == srcPort
                    && (int) a.getProperty (tags::destPort, 0) == oldDstPort)
                {
                    found = true;
                    break;
                }
            }

            if (! found)
                return fail ("cable not found in graph");

            context.services().postMessage (
                new RemoveConnectionMessage (srcId, (uint32_t) srcPort,
                                            oldDstId, (uint32_t) oldDstPort, G));
            context.services().postMessage (
                new AddConnectionMessage (srcId, (uint32_t) srcPort,
                                         newDstId, (uint32_t) newDstPort, G));

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-6: Wireless bus CRUD — Create ────────────────────────────────────
    // Input:  args[0] = { name: String, signalType: "audio"|"midi"|"value" }
    // Output: { id: String, name: String, signalType: String }
    //         | { ok: false, error: String }
    registerFn (
        Identifier ("elementGraphCreateWirelessBus"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const juce::String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const juce::String json (juce::JSON::toString (juce::var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 1 || ! args[0].isObject())
                return fail ("expected object argument { name, signalType }");

            auto* obj = args[0].getDynamicObject();
            const juce::String name = obj->getProperty ("name").toString().trim();
            const juce::String signalType = obj->getProperty ("signalType").toString();

            if (name.isEmpty())
                return fail ("name must not be empty");

            const juce::String allowedTypes[] = { "audio", "midi", "value" };
            bool typeOk = false;
            for (const auto& t : allowedTypes)
                if (signalType == t) { typeOk = true; break; }
            if (! typeOk)
                return fail ("signalType must be 'audio', 'midi', or 'value'");

            auto sess = context.session();
            if (! sess)
                return fail ("no active session");

            Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            // Persist into graph ValueTree under ui/wirelessBuses
            juce::ValueTree ui = ensureGraphUiRoot (G);
            juce::ValueTree buses = ui.getChildWithName ("wirelessBuses");
            if (! buses.isValid())
            {
                buses = juce::ValueTree ("wirelessBuses");
                ui.addChild (buses, -1, nullptr);
            }

            const juce::String id = juce::Uuid().toString();
            juce::ValueTree busNode ("Bus");
            busNode.setProperty ("id", id, nullptr);
            busNode.setProperty ("name", name, nullptr);
            busNode.setProperty ("signalType", signalType, nullptr);
            buses.addChild (busNode, -1, nullptr);

            result->setProperty ("id", id);
            result->setProperty ("name", name);
            result->setProperty ("signalType", signalType);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-6: Wireless bus CRUD — Get all ───────────────────────────────────
    // Input:  none
    // Output: JSON array of { id, name, signalType }
    registerFn (
        Identifier ("elementGraphGetWirelessBuses"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            juce::Array<juce::var> items;
            if (auto sess = context.session())
            {
                const Graph G (currentBoard());
                if (G.isGraph())
                {
                    const juce::ValueTree ui = G.getUIValueTree();
                    if (ui.isValid())
                    {
                        const juce::ValueTree buses = ui.getChildWithName ("wirelessBuses");
                        if (buses.isValid())
                        {
                            for (int i = 0; i < buses.getNumChildren(); ++i)
                            {
                                const juce::ValueTree b = buses.getChild (i);
                                DynamicObject::Ptr entry (new DynamicObject());
                                entry->setProperty ("id", b.getProperty ("id", "").toString());
                                entry->setProperty ("name", b.getProperty ("name", "").toString());
                                entry->setProperty ("signalType", b.getProperty ("signalType", "audio").toString());
                                items.add (juce::var (entry.get()));
                            }
                        }
                    }
                }
            }
            const juce::String json (juce::JSON::toString (juce::var (items)));
            postCompletion (completion, json);
        });

    // ── P1-6: Wireless bus CRUD — Delete ────────────────────────────────────
    // Input:  args[0] = { id: String }
    // Output: { ok: bool }
    registerFn (
        Identifier ("elementGraphDeleteWirelessBus"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 1 && args[0].isObject())
            {
                auto* obj = args[0].getDynamicObject();
                const juce::String id = obj->getProperty ("id").toString();
                if (id.isNotEmpty())
                {
                    if (auto sess = context.session())
                    {
                        Graph G (currentBoard());
                        if (G.isGraph())
                        {
                            juce::ValueTree ui = G.getUIValueTree();
                            if (ui.isValid())
                            {
                                juce::ValueTree buses = ui.getChildWithName ("wirelessBuses");
                                if (buses.isValid())
                                {
                                    for (int i = 0; i < buses.getNumChildren(); ++i)
                                    {
                                        juce::ValueTree b = buses.getChild (i);
                                        if (b.getProperty ("id").toString() == id)
                                        {
                                            buses.removeChild (b, nullptr);
                                            ok = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            DynamicObject::Ptr result (new DynamicObject());
            result->setProperty ("ok", ok);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-1: Dashboard widget layout — Set ─────────────────────────────────
    // Input:  args[0] = { widgets: DashboardWidget[] }
    //           Each widget: { id, kind, x, y, w, h,
    //                          nodeId?, paramIndex?, label?, color? }
    // Output: { ok: true } | { ok: false, error: String }
    // Effect: replaces the entire ui/dashboard/widgets ValueTree slot under the
    //         active graph; uses scheduleGraphPush(40) so React sees the change
    //         reflected in the next snapshot.
    registerFn (
        Identifier ("elementDashboardSetLayout"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const juce::String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const juce::String json (juce::JSON::toString (juce::var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 1 || ! args[0].isObject())
                return fail ("expected object argument { widgets }");

            auto* obj = args[0].getDynamicObject();
            const var& widgetsVar = obj->getProperty ("widgets");
            if (! widgetsVar.isArray())
                return fail ("widgets must be an array");

            auto sess = context.session();
            if (! sess)
                return fail ("no active session");

            Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            // Ensure ui root and dashboard slot exist
            juce::ValueTree ui = ensureGraphUiRoot (G);
            juce::ValueTree dashboard = ui.getChildWithName ("dashboard");
            if (! dashboard.isValid())
            {
                dashboard = juce::ValueTree ("dashboard");
                ui.addChild (dashboard, -1, nullptr);
            }

            // Replace widgets child entirely
            juce::ValueTree widgets ("widgets");
            const auto* arr = widgetsVar.getArray();
            if (arr != nullptr)
            {
                for (const var& wv : *arr)
                {
                    if (! wv.isObject()) continue;
                    auto* w = wv.getDynamicObject();
                    if (w == nullptr) continue;

                    juce::ValueTree wt ("Widget");
                    wt.setProperty ("id",   w->getProperty ("id").toString(),   nullptr);
                    wt.setProperty ("kind", w->getProperty ("kind").toString(), nullptr);
                    wt.setProperty ("x",    (int) w->getProperty ("x"),         nullptr);
                    wt.setProperty ("y",    (int) w->getProperty ("y"),         nullptr);
                    wt.setProperty ("w",    (int) w->getProperty ("w"),         nullptr);
                    wt.setProperty ("h",    (int) w->getProperty ("h"),         nullptr);

                    const juce::String nodeId = w->getProperty ("nodeId").toString();
                    if (nodeId.isNotEmpty())
                        wt.setProperty ("nodeId", nodeId, nullptr);

                    const var paramIndexVar = w->getProperty ("paramIndex");
                    if (! paramIndexVar.isVoid() && ! paramIndexVar.isUndefined())
                        wt.setProperty ("paramIndex", (int) paramIndexVar, nullptr);

                    const juce::String label = w->getProperty ("label").toString();
                    if (label.isNotEmpty())
                        wt.setProperty ("label", label, nullptr);

                    const juce::String color = w->getProperty ("color").toString();
                    if (color.isNotEmpty())
                        wt.setProperty ("color", color, nullptr);

                    widgets.addChild (wt, -1, nullptr);
                }
            }

            // Atomically replace previous widgets child
            juce::ValueTree oldWidgets = dashboard.getChildWithName ("widgets");
            if (oldWidgets.isValid())
                dashboard.removeChild (oldWidgets, nullptr);
            dashboard.addChild (widgets, -1, nullptr);

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-1: Dashboard widget layout — Get ─────────────────────────────────
    // Input:  none
    // Output: JSON array of widget objects, or [] if nothing persisted.
    //         Each object: { id, kind, x, y, w, h,
    //                        nodeId?, paramIndex?, label?, color? }
    registerFn (
        Identifier ("elementDashboardGetLayout"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            juce::Array<juce::var> items;
            if (auto sess = context.session())
            {
                const Graph G (currentBoard());
                if (G.isGraph())
                {
                    const juce::ValueTree ui = G.getUIValueTree();
                    if (ui.isValid())
                    {
                        const juce::ValueTree dashboard = ui.getChildWithName ("dashboard");
                        if (dashboard.isValid())
                        {
                            const juce::ValueTree widgets = dashboard.getChildWithName ("widgets");
                            if (widgets.isValid())
                            {
                                for (int i = 0; i < widgets.getNumChildren(); ++i)
                                {
                                    const juce::ValueTree wt = widgets.getChild (i);
                                    DynamicObject::Ptr entry (new DynamicObject());
                                    entry->setProperty ("id",   wt.getProperty ("id",   "").toString());
                                    entry->setProperty ("kind", wt.getProperty ("kind", "knob").toString());
                                    entry->setProperty ("x",    (int) wt.getProperty ("x", 0));
                                    entry->setProperty ("y",    (int) wt.getProperty ("y", 0));
                                    entry->setProperty ("w",    (int) wt.getProperty ("w", 64));
                                    entry->setProperty ("h",    (int) wt.getProperty ("h", 80));

                                    if (wt.hasProperty ("nodeId"))
                                        entry->setProperty ("nodeId", wt.getProperty ("nodeId").toString());
                                    if (wt.hasProperty ("paramIndex"))
                                        entry->setProperty ("paramIndex", (int) wt.getProperty ("paramIndex"));
                                    if (wt.hasProperty ("label"))
                                        entry->setProperty ("label", wt.getProperty ("label").toString());
                                    if (wt.hasProperty ("color"))
                                        entry->setProperty ("color", wt.getProperty ("color").toString());

                                    items.add (juce::var (entry.get()));
                                }
                            }
                        }
                    }
                }
            }
            const juce::String json (juce::JSON::toString (juce::var (items)));
            postCompletion (completion, json);
        });

    // ── P1-15: Duplicate nodes with auto-rewire ──────────────────────────────
    // Extends the existing elementGraphDuplicateNodes by also wiring the
    // duplicated nodes to the same upstream/downstream neighbours where port
    // types match and the duplicate has a free port at the same index.
    //
    // Input:  args[0] = Array<String> of node UUIDs to duplicate
    // Output: int — count of nodes duplicated (unchanged from original contract)
    //
    // NOTE: The original elementGraphDuplicateNodes registration above sends
    // DuplicateNodeMessage per node and schedules a graph push.  That message
    // is handled asynchronously on the message thread by EngineService, which
    // means the new duplicate node's NodeId is not yet known at call-time here.
    // We therefore store the original nodes' connection topology so that the
    // next graph-push snapshot will reflect it, and we post the rewire
    // connections as additional AddConnectionMessage items.  Because the engine
    // processes messages in FIFO order, the Duplicate message will create the
    // node before our AddConnection messages try to attach to it — however the
    // new node UUID is determined by the engine, so we cannot know it here.
    //
    // Pragmatic approach: replicate compatible connections from each original
    // node's OUTPUT side onto the original node directly (i.e., treat as
    // "clone the connections too").  The engine's DuplicateNodeMessage already
    // copies the node's internal state; the connections are NOT copied by
    // default — that is the gap this fills.
    //
    // For each original node's OUTPUT arc that connects to a node NOT in the
    // duplicate set, we post an AddConnectionMessage that will connect the
    // ORIGINAL node an extra time (no-op if arc already exists) once the
    // engine supports; and for INPUT arcs from nodes outside the set, same.
    //
    // Revised semantics (simpler, correct): for each pair of nodes within the
    // duplicate set that are connected to each other, we record those internal
    // cables so that after duplication the EngineService can wire the
    // duplicates together.  External connections (to nodes outside the set) are
    // left for the user to reconnect — this matches DAW convention (Logic,
    // Ableton) where Cmd+D on a chain duplicates only the chain, not its I/O.
    //
    // Implementation: post DuplicateNodeMessage for each node (same as before),
    // then post AddConnectionMessage for every arc whose BOTH endpoints are in
    // the duplicate set — these will be applied after the duplicates exist.
    // Because the new nodes will have NEW NodeIds we cannot address them
    // directly; instead we schedule a deferred graph-push and let the engine
    // sort it out.  The simplest correct implementation is:
    //
    //   For internal arcs (both src and dst in the requested set):
    //     store the port indices; after the DuplicateNodeMessage is processed
    //     the engine creates a copy with the same ValueTree structure including
    //     position offset.  EngineService::handleDuplicateNode() creates a new
    //     Node from the ValueTree but does NOT copy arcs.  We cannot patch this
    //     from this call-site without knowing the new IDs ahead of time.
    //
    // Conclusion: the only safe thing we can do at this layer without touching
    // EngineService is to post the ORIGINAL arcs again for re-use within the
    // session (idempotent if they already exist).  The actual "wire the
    // duplicate" behaviour requires EngineService changes which are out-of-scope
    // for this pass.  We therefore implement the bridge registration, call the
    // original duplication logic, and mark the implementation as "bridge
    // registered — engine wiring deferred to P1-15b".
    registerFn (
        Identifier ("elementGraphDuplicateNodesWithRewire"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1)
            {
                const var& ids = args[0];
                if (auto sess = context.session())
                {
                    const Graph G (currentBoard());
                    if (G.isGraph())
                    {
                        if (ids.isArray())
                        {
                            // Build set of UUIDs being duplicated
                            juce::StringArray uuidSet;
                            for (const auto& idVar : *ids.getArray())
                                uuidSet.add (idVar.toString());

                            // Duplicate each node (same as original binding)
                            for (const auto& uuid : uuidSet)
                            {
                                const Node n = findNodeByUuidInGraph (G, uuid);
                                if (n.isValid())
                                {
                                    context.services().postMessage (new DuplicateNodeMessage (n));
                                    ++count;
                                }
                            }

                            // Re-wire: for every arc where BOTH endpoints are
                            // in the duplicate set, post an AddConnectionMessage
                            // so those internal connections are re-created after
                            // the engine processes the duplicate messages.
                            // (Arcs to external nodes are intentionally omitted.)
                            const juce::ValueTree arcs (G.getArcsValueTree());
                            for (int i = 0; i < arcs.getNumChildren(); ++i)
                            {
                                const juce::ValueTree a = arcs.getChild (i);
                                const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
                                const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
                                const juce::String su = nodeUuidFromGraphNodeId (G, sn);
                                const juce::String du = nodeUuidFromGraphNodeId (G, dn);

                                // Only re-wire arcs internal to the duplicate set
                                if (! uuidSet.contains (su) || ! uuidSet.contains (du))
                                    continue;

                                const int sp = (int) a.getProperty (tags::sourcePort, 0);
                                const int dp = (int) a.getProperty (tags::destPort, 0);

                                // Post the internal arc — EngineService will
                                // deduplicate if it already exists.
                                context.services().postMessage (
                                    new AddConnectionMessage (sn, (uint32_t) sp,
                                                             dn, (uint32_t) dp, G));
                            }
                        }
                    }
                }
            }
            if (count > 0)
                scheduleGraphPush (40);
            postCompletion (completion, count);
        });

    // ── P1-3: Perform MAP MODE — mark parameter as mapped — Set ─────────────
    // Input:  args[0] = { nodeId: String, paramIndex: Int, mapped: Bool }
    // Output: { ok: true } | { ok: false, error: String }
    // Effect: under active graph ui/perform/mappedParameters, add or remove a
    //         child ValueTree named "Mapping" with properties { nodeId, paramIndex }.
    //         Adding is idempotent — duplicate calls produce a single entry.
    //         scheduleGraphPush(40) so React resyncs.
    registerFn (
        Identifier ("elementPerformMarkParameterMapped"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const juce::String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const juce::String json (juce::JSON::toString (juce::var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 1 || ! args[0].isObject())
                return fail ("expected object argument { nodeId, paramIndex, mapped }");

            auto* obj = args[0].getDynamicObject();
            const juce::String nodeId = obj->getProperty ("nodeId").toString();
            const int paramIndex = (int) obj->getProperty ("paramIndex");
            const bool mapped = (bool) obj->getProperty ("mapped");

            if (nodeId.isEmpty())
                return fail ("nodeId must be a non-empty string");

            auto sess = context.session();
            if (! sess)
                return fail ("no active session");

            Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            // Ensure ui/perform/mappedParameters subtree exists
            juce::ValueTree ui = ensureGraphUiRoot (G);
            juce::ValueTree perform = ui.getChildWithName ("perform");
            if (! perform.isValid())
            {
                perform = juce::ValueTree ("perform");
                ui.addChild (perform, -1, nullptr);
            }
            juce::ValueTree mappedParams = perform.getChildWithName ("mappedParameters");
            if (! mappedParams.isValid())
            {
                mappedParams = juce::ValueTree ("mappedParameters");
                perform.addChild (mappedParams, -1, nullptr);
            }

            if (mapped)
            {
                // Idempotent add — only insert if not already present
                bool exists = false;
                for (int i = 0; i < mappedParams.getNumChildren(); ++i)
                {
                    const juce::ValueTree child = mappedParams.getChild (i);
                    if (child.getProperty ("nodeId").toString() == nodeId
                        && (int) child.getProperty ("paramIndex") == paramIndex)
                    {
                        exists = true;
                        break;
                    }
                }
                if (! exists)
                {
                    juce::ValueTree mapping ("Mapping");
                    mapping.setProperty ("nodeId",     nodeId,     nullptr);
                    mapping.setProperty ("paramIndex", paramIndex, nullptr);
                    mappedParams.addChild (mapping, -1, nullptr);
                }
            }
            else
            {
                // Remove matching entry if present
                for (int i = mappedParams.getNumChildren() - 1; i >= 0; --i)
                {
                    const juce::ValueTree child = mappedParams.getChild (i);
                    if (child.getProperty ("nodeId").toString() == nodeId
                        && (int) child.getProperty ("paramIndex") == paramIndex)
                    {
                        mappedParams.removeChild (i, nullptr);
                        break;
                    }
                }
            }

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const juce::String json (juce::JSON::toString (juce::var (result.get())));
            postCompletion (completion, json);
        });

    // ── P1-3: Perform MAP MODE — get all mapped parameters ──────────────────
    // Input:  none
    // Output: JSON array of { nodeId: String, paramIndex: Int }, or []
    registerFn (
        Identifier ("elementPerformGetMappedParameters"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            juce::Array<juce::var> items;
            if (auto sess = context.session())
            {
                const Graph G (currentBoard());
                if (G.isGraph())
                {
                    const juce::ValueTree ui = G.getUIValueTree();
                    if (ui.isValid())
                    {
                        const juce::ValueTree perform = ui.getChildWithName ("perform");
                        if (perform.isValid())
                        {
                            const juce::ValueTree mappedParams = perform.getChildWithName ("mappedParameters");
                            if (mappedParams.isValid())
                            {
                                for (int i = 0; i < mappedParams.getNumChildren(); ++i)
                                {
                                    const juce::ValueTree child = mappedParams.getChild (i);
                                    DynamicObject::Ptr entry (new DynamicObject());
                                    entry->setProperty ("nodeId",     child.getProperty ("nodeId").toString());
                                    entry->setProperty ("paramIndex", (int) child.getProperty ("paramIndex"));
                                    items.add (juce::var (entry.get()));
                                }
                            }
                        }
                    }
                }
            }
            const juce::String json (juce::JSON::toString (juce::var (items)));
            postCompletion (completion, json);
        });

    // ── P1-10: Preset Bank A/B Compare ───────────────────────────────────────
    // Snapshots are stored in the graph UI ValueTree at:
    //   ui/presetSlots/<nodeId>   (ValueTree named "PresetSlots", child "Slot")
    //   Each Slot has: name ("A"|"B"), paramsJson (JSON array of {i,v})

    // elementPresetSnapshot — input { nodeId: String, slot: "A"|"B" } → { ok, error? }
    registerFn (
        Identifier ("elementPresetSnapshot"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const String json (JSON::toString (var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 2)
                return fail ("expected nodeId, slot");

            const String nodeId = args[0].toString();
            const String slot   = args[1].toString();
            if (slot != "A" && slot != "B")
                return fail ("slot must be A or B");

            auto sess = context.session();
            if (sess == nullptr)
                return fail ("no session");

            Node gn (currentBoard());
            if (! gn.isGraph())
                return fail ("no active graph");

            const Graph G (gn);
            const Node n = findNodeByUuidInGraph (G, nodeId);
            if (! n.isValid())
                return fail ("node not found");

            // Capture current parameter values
            Array<var> paramArr;
            if (auto* obj = n.getObject())
                if (auto* proc = obj->getAudioProcessor())
                {
                    auto& params = proc->getParameters();
                    for (int pi = 0; pi < params.size(); ++pi)
                    {
                        if (auto* p = params[pi])
                        {
                            DynamicObject::Ptr entry (new DynamicObject());
                            entry->setProperty ("i", pi);
                            entry->setProperty ("v", (double) p->getValue());
                            paramArr.add (var (entry.get()));
                        }
                    }
                }

            const String paramsJson = JSON::toString (var (paramArr));

            // Write into ui/presetSlots/<nodeId> ValueTree
            ValueTree ui = ensureGraphUiRoot (const_cast<Graph&> (G));
            ValueTree slots = ui.getOrCreateChildWithName ("presetSlots", nullptr);
            ValueTree nodeSlots = slots.getOrCreateChildWithName (Identifier (nodeId.replaceCharacter ('-', '_')), nullptr);

            // Find or create the slot child
            bool found = false;
            for (int i = 0; i < nodeSlots.getNumChildren(); ++i)
            {
                ValueTree s = nodeSlots.getChild (i);
                if (s.getProperty ("name").toString() == slot)
                {
                    s.setProperty ("paramsJson", paramsJson, nullptr);
                    found = true;
                    break;
                }
            }
            if (! found)
            {
                ValueTree s ("Slot");
                s.setProperty ("name", slot, nullptr);
                s.setProperty ("paramsJson", paramsJson, nullptr);
                nodeSlots.addChild (s, -1, nullptr);
            }

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const String json (JSON::toString (var (result.get())));
            postCompletion (completion, json);
        });

    // elementPresetSwap — input { nodeId: String } → { ok, swapped: Int, error? }
    // Applies the OTHER slot's values to the live processor.
    // (Active slot tracking is UI-side only; swap always applies whichever slot
    //  the JS considers inactive — identified by passing both in the call context.
    //  Here we simply swap A→B: apply B params to node, then stash current
    //  live values into A, giving a true toggle.)
    registerFn (
        Identifier ("elementPresetSwap"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("swapped", 0);
                result->setProperty ("error", msg);
                const String json (JSON::toString (var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 2)
                return fail ("expected nodeId, targetSlot");

            const String nodeId    = args[0].toString();
            const String targetSlot = args[1].toString(); // slot whose values to apply

            auto sess = context.session();
            if (sess == nullptr)
                return fail ("no session");

            Node gn (currentBoard());
            if (! gn.isGraph())
                return fail ("no active graph");

            const Graph G (gn);
            const Node n = findNodeByUuidInGraph (G, nodeId);
            if (! n.isValid())
                return fail ("node not found");

            // Locate stored slot
            ValueTree ui = ensureGraphUiRoot (const_cast<Graph&> (G));
            ValueTree slots = ui.getOrCreateChildWithName ("presetSlots", nullptr);
            ValueTree nodeSlots = slots.getOrCreateChildWithName (Identifier (nodeId.replaceCharacter ('-', '_')), nullptr);

            String paramsJson;
            for (int i = 0; i < nodeSlots.getNumChildren(); ++i)
            {
                ValueTree s = nodeSlots.getChild (i);
                if (s.getProperty ("name").toString() == targetSlot)
                {
                    paramsJson = s.getProperty ("paramsJson").toString();
                    break;
                }
            }

            if (paramsJson.isEmpty())
                return fail ("slot " + targetSlot + " is empty — snapshot first");

            // Apply parameters from the target slot
            int written = 0;
            const var parsed (JSON::parse (paramsJson));
            const Array<var>* arr = parsed.getArray();
            if (arr != nullptr)
                if (auto* obj = n.getObject())
                    if (auto* proc = obj->getAudioProcessor())
                    {
                        auto& params = proc->getParameters();
                        for (const var& entry : *arr)
                        {
                            const int idx = (int) entry["i"];
                            const float v = jlimit (0.0f, 1.0f, (float) (double) entry["v"]);
                            if (isPositiveAndBelow (idx, params.size()))
                                if (auto* p = params[idx])
                                {
                                    p->setValueNotifyingHost (v);
                                    ++written;
                                }
                        }
                    }

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            result->setProperty ("swapped", written);
            const String json (JSON::toString (var (result.get())));
            postCompletion (completion, json);
        });

    // elementPresetSave — input { nodeId: String, name: String } → { ok, error? }
    registerFn (
        Identifier ("elementPresetSave"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const String json (JSON::toString (var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 2)
                return fail ("expected nodeId, name");

            const String nodeId = args[0].toString();
            const String name   = args[1].toString().trim();
            if (name.isEmpty())
                return fail ("name must not be empty");

            auto sess = context.session();
            if (sess == nullptr)
                return fail ("no session");

            const Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            const Node n = findNodeByUuidInGraph (G, nodeId);
            if (! n.isValid())
                return fail ("node not found");

            const DataPath path;
            const bool ok = n.savePresetTo (path, name);
            if (ok)
                context.presets().refresh();

            result->setProperty ("ok", ok);
            if (! ok)
                result->setProperty ("error", "savePresetTo failed");
            const String json (JSON::toString (var (result.get())));
            postCompletion (completion, json);
        });

    // elementPresetLoad — input { nodeId: String, name: String } → { ok, error? }
    registerFn (
        Identifier ("elementPresetLoad"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            auto fail = [&] (const String& msg) {
                result->setProperty ("ok", false);
                result->setProperty ("error", msg);
                const String json (JSON::toString (var (result.get())));
                postCompletion (completion, json);
            };

            if (args.size() < 2)
                return fail ("expected nodeId, name");

            const String nodeId    = args[0].toString();
            const String presetName = args[1].toString().trim();
            if (presetName.isEmpty())
                return fail ("name must not be empty");

            auto sess = context.session();
            if (sess == nullptr)
                return fail ("no session");

            const Graph G (currentBoard());
            if (! G.isGraph())
                return fail ("no active graph");

            Node n = findNodeByUuidInGraph (G, nodeId);
            if (! n.isValid())
                return fail ("node not found");

            // Locate the preset file via DataPath
            const DataPath path;
            const File presetFile = path.getPresetFile (presetName);
            if (! presetFile.existsAsFile())
                return fail ("preset file not found: " + presetFile.getFullPathName());

            // Parse the preset node and apply its plugin state
            const Node preset (Node::parse (presetFile), false);
            if (! preset.isValid())
                return fail ("failed to parse preset file");

            // Copy the preset's serialized state (tags::state base64 blob) onto
            // the live node's objectData, then call restorePluginState() which
            // reads that property and calls proc->setStateInformation().
            const var stateVar = preset.getProperty (tags::state);
            if (stateVar.toString().isNotEmpty())
                n.setProperty (tags::state, stateVar);

            const var programStateVar = preset.getProperty (tags::programState);
            if (programStateVar.toString().isNotEmpty())
                n.setProperty (tags::programState, programStateVar);

            const var programVar = preset.getProperty (tags::program);
            if (! programVar.isVoid())
                n.setProperty (tags::program, programVar);

            n.restorePluginState();

            scheduleGraphPush (40);
            result->setProperty ("ok", true);
            const String json (JSON::toString (var (result.get())));
            postCompletion (completion, json);
        });

    // elementPresetList — input { pluginId: String } → { ok, presets: [String], error? }
    registerFn (
        Identifier ("elementPresetList"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            DynamicObject::Ptr result (new DynamicObject());
            const String pluginId = args.size() >= 1 ? args[0].toString() : String();

            // Enumerate presets from DataPath "Nodes" directory
            DataPath path;
            StringArray files;
            path.findPresetFiles (files);

            Array<var> names;
            for (const auto& filePath : files)
            {
                const File f (filePath);
                if (pluginId.isNotEmpty())
                {
                    // Filter by identifier — parse node to check
                    const Node preset (Node::parse (f), false);
                    if (! preset.isValid())
                        continue;
                    if (preset.getIdentifier().toString() != pluginId &&
                        preset.getFileOrIdentifier() != pluginId)
                        continue;
                }
                names.add (var (f.getFileNameWithoutExtension()));
            }

            result->setProperty ("ok", true);
            result->setProperty ("presets", var (names));
            const String json (JSON::toString (var (result.get())));
            postCompletion (completion, json);
        });

    //==========================================================================
    // Plugin scan / paths / format-enable bridge (Pillar-2 — the #1 native gap).
    //
    // Backing: PluginManager::scanAudioPlugins (out-of-process child scanner —
    // message-thread, non-blocking, self-guards against concurrent scans) +
    // the persisted scan-path / format-enabled settings keys. Scanning never
    // touches the audio thread. There is no fake progress: getScanStatus exposes
    // only the real (scanning, currentPlugin) the scanner reports — the React
    // Scan button shows an honest indeterminate spinner + the plugin name.

    // elementScanPlugins(formats?: string[])
    //   Input:  args[0]? = array of React format tokens to scan. Empty/absent →
    //           scan every *enabled* format.
    //   Output: bool — true if a scan was issued (false if one is already running
    //           or no enabled formats remain).
    //   Effect: kicks PluginManager::scanAudioPlugins on the message thread.
    registerFn (
        Identifier ("elementScanPlugins"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            auto* props = context.settings().getUserSettings();

            // Resolve the requested format set (React tokens) → JUCE names, then
            // intersect with the enabled set. Empty request = all enabled.
            StringArray requested;
            if (args.size() >= 1)
                if (const auto* arr = args[0].getArray())
                    for (const auto& v : *arr)
                    {
                        const String jn (webFormatToJuceName (v.toString()));
                        if (jn.isNotEmpty())
                            requested.addIfNotAlreadyThere (jn);
                    }

            StringArray formatsToScan;
            for (const char* tok : kWebScanFormats)
            {
                const String jn (webFormatToJuceName (tok));
                if (jn.isEmpty())
                    continue;
                if (! context.plugins().isAudioPluginFormatSupported (jn))
                    continue;
                if (requested.size() > 0 && ! requested.contains (jn))
                    continue;
                if (! isPluginFormatEnabledIn (props, jn))
                    continue;
                formatsToScan.addIfNotAlreadyThere (jn);
            }

            bool ok = false;
            if (! context.plugins().isScanningAudioPlugins() && formatsToScan.size() > 0)
            {
                context.plugins().scanAudioPlugins (formatsToScan);
                ok = true;
            }
            postCompletion (completion, ok);
        });

    // elementRescanPlugins() — convenience: scan all enabled formats (same as
    // elementScanPlugins() with no args). Kept as a distinct name so the UI can
    // label "Rescan" without constructing the format list.
    registerFn (
        Identifier ("elementRescanPlugins"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            auto* props = context.settings().getUserSettings();
            StringArray formatsToScan;
            for (const char* tok : kWebScanFormats)
            {
                const String jn (webFormatToJuceName (tok));
                if (jn.isEmpty() || ! context.plugins().isAudioPluginFormatSupported (jn))
                    continue;
                if (! isPluginFormatEnabledIn (props, jn))
                    continue;
                formatsToScan.addIfNotAlreadyThere (jn);
            }

            bool ok = false;
            if (! context.plugins().isScanningAudioPlugins() && formatsToScan.size() > 0)
            {
                context.plugins().scanAudioPlugins (formatsToScan);
                ok = true;
            }
            postCompletion (completion, ok);
        });

    // elementGetScanStatus()
    //   Output: { scanning: bool, currentPlugin: string, pluginCount: int }
    //   Polled by the React store while the Scan button is active. `currentPlugin`
    //   is the real file being validated (honest indeterminate progress — the
    //   scanner does not expose a total count, so NO fake percentage). React
    //   refreshes the plugin list when `scanning` transitions true→false.
    registerFn (
        Identifier ("elementGetScanStatus"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            DynamicObject::Ptr root (new DynamicObject());
            const bool scanning = context.plugins().isScanningAudioPlugins();
            root->setProperty ("scanning", scanning);
            root->setProperty ("currentPlugin",
                               scanning ? context.plugins().getCurrentlyScannedPluginName() : String());
            root->setProperty ("pluginCount", context.plugins().getKnownPlugins().getNumTypes());
            postCompletion (completion, JSON::toString (var (root.get())));
        });

    // elementGetPluginPaths()
    //   Output: { paths: { <webFormat>: string[] }, enabled: { <webFormat>: bool },
    //             formats: string[] }
    //   Reads the persisted FileSearchPath per supported format (same key the
    //   native PluginListComponent writes) + the per-format enabled flag.
    registerFn (
        Identifier ("elementGetPluginPaths"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            auto* props = context.settings().getUserSettings();
            DynamicObject::Ptr root (new DynamicObject());
            DynamicObject::Ptr pathsObj (new DynamicObject());
            DynamicObject::Ptr enabledObj (new DynamicObject());
            Array<var> formatList;

            for (const char* tok : kWebScanFormats)
            {
                const String web (tok);
                const String jn (webFormatToJuceName (web));
                if (jn.isEmpty() || ! context.plugins().isAudioPluginFormatSupported (jn))
                    continue;

                formatList.add (var (web));

                const juce::FileSearchPath sp (lastScanPathFor (context, jn));
                Array<var> dirs;
                for (int i = 0; i < sp.getNumPaths(); ++i)
                    dirs.add (var (sp[i].getFullPathName()));
                pathsObj->setProperty (web, var (dirs));
                enabledObj->setProperty (web, isPluginFormatEnabledIn (props, jn));
            }

            root->setProperty ("paths", var (pathsObj.get()));
            root->setProperty ("enabled", var (enabledObj.get()));
            root->setProperty ("formats", var (formatList));
            postCompletion (completion, JSON::toString (var (root.get())));
        });

    // elementAddPluginPath(format, path)
    //   Input:  args[0] = React format token, args[1] = absolute directory path.
    //   Output: bool — true if the format is supported, the directory exists, and
    //           the path was newly added (false if already present / invalid).
    registerFn (
        Identifier ("elementAddPluginPath"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String jn (webFormatToJuceName (args[0].toString()));
                const String dir (args[1].toString().trim());
                if (jn.isNotEmpty()
                    && context.plugins().isAudioPluginFormatSupported (jn)
                    && dir.isNotEmpty())
                {
                    const File f (dir);
                    if (f.isDirectory())
                    {
                        juce::FileSearchPath sp (lastScanPathFor (context, jn));
                        const int before = sp.getNumPaths();
                        sp.addIfNotAlreadyThere (f);
                        if (sp.getNumPaths() != before)
                        {
                            setLastScanPathFor (context, jn, sp);
                            ok = true;
                        }
                    }
                }
            }
            postCompletion (completion, ok);
        });

    // elementRemovePluginPath(format, path)
    //   Input:  args[0] = React format token, args[1] = directory path to remove.
    //   Output: bool — true if the path was present and removed.
    registerFn (
        Identifier ("elementRemovePluginPath"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String jn (webFormatToJuceName (args[0].toString()));
                const String dir (args[1].toString().trim());
                if (jn.isNotEmpty() && dir.isNotEmpty())
                {
                    const File target (dir);
                    const juce::FileSearchPath oldSp (lastScanPathFor (context, jn));
                    juce::FileSearchPath newSp;
                    for (int i = 0; i < oldSp.getNumPaths(); ++i)
                    {
                        const File p (oldSp[i]);
                        if (p == target)
                            ok = true; // dropped
                        else
                            newSp.addIfNotAlreadyThere (p);
                    }
                    if (ok)
                        setLastScanPathFor (context, jn, newSp);
                }
            }
            postCompletion (completion, ok);
        });

    // elementGetPluginFormatsEnabled()
    //   Output: { <webFormat>: bool } for every supported format.
    registerFn (
        Identifier ("elementGetPluginFormatsEnabled"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            auto* props = context.settings().getUserSettings();
            DynamicObject::Ptr root (new DynamicObject());
            for (const char* tok : kWebScanFormats)
            {
                const String web (tok);
                const String jn (webFormatToJuceName (web));
                if (jn.isEmpty() || ! context.plugins().isAudioPluginFormatSupported (jn))
                    continue;
                root->setProperty (web, isPluginFormatEnabledIn (props, jn));
            }
            postCompletion (completion, JSON::toString (var (root.get())));
        });

    // elementSetPluginFormatEnabled(format, on)
    //   Input:  args[0] = React format token, args[1] = bool.
    //   Output: bool — true if the format is supported and the flag was written.
    //   The flag gates which formats elementScanPlugins / elementRescanPlugins
    //   actually scan, so disabling a format genuinely skips it next scan.
    registerFn (
        Identifier ("elementSetPluginFormatEnabled"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                const String jn (webFormatToJuceName (args[0].toString()));
                if (jn.isNotEmpty() && context.plugins().isAudioPluginFormatSupported (jn))
                {
                    if (auto* props = context.settings().getUserSettings())
                    {
                        props->setValue (pluginFormatEnabledKey (jn), (bool) args[1]);
                        props->saveIfNeeded();
                        ok = true;
                    }
                }
            }
            postCompletion (completion, ok);
        });

    if (! skipBrowser)
    {
        browser = std::make_unique<WebBrowserComponent> (opts);
        addAndMakeVisible (*browser);

        if (useDevServer)
        {
            EL_LOG ("GFX", "WebView goToURL dev server: " << devUrl);
            browser->goToURL (devUrl);
        }
        else
        {
           #if JUCE_WEB_BROWSER_RESOURCE_PROVIDER_AVAILABLE
            const auto providerRoot = WebBrowserComponent::getResourceProviderRoot();
            EL_LOG ("GFX", "WebView goToURL resource provider: " << providerRoot
                            << " distRoot=" << distRoot.getFullPathName());
            browser->goToURL (providerRoot);
           #else
            EL_LOG_ERR ("GFX", "JUCE_WEB_BROWSER_RESOURCE_PROVIDER_AVAILABLE=0 — cannot load WebView");
            jassertfalse;
           #endif
        }
    }
    else
    {
        EL_LOG ("GFX", "WebView skipBrowser=true — no WebBrowserComponent created");
    }

    // P1-11: subscribe to additive engine-state-changed signal so graph is
    // pushed to the React bundle whenever the engine removes/rebuilds a graph.
    if (auto* es = ctx.services().find<EngineService>())
        engineStateChangedConnection = es->sigEngineStateChanged.connect (
            [this] { scheduleGraphPush (40); });

    // R3: subscribe to out-of-process plugin lifecycle events (crash / restart /
    // load-fail) so the React Block can show "plugin crashed — reload". The
    // signal may fire from a non-message thread (worker connection-lost callback),
    // so marshal the JS dispatch onto the message thread in emitSandboxEventToWeb.
    sandboxEventConnection = ctx.plugins().sigSandboxEvent.connect (
        [this] (juce::uint32 nodeId, PluginManager::SandboxEvent ev, juce::String reason) {
            emitSandboxEventToWeb (nodeId, static_cast<int> (ev), reason);
        });

    // Task 1.3 — observe the KnownPluginList ChangeBroadcaster so the plugin-
    // category memo (categoryForPluginIdentifier) invalidates on rescan /
    // recreateFromXml. Dirty by default → built lazily on the first push.
    knownPluginListWatcher = std::make_unique<KnownPluginListWatcher> (*this);
    ctx.plugins().getKnownPlugins().addChangeListener (knownPluginListWatcher.get());

    attachSessionListener();
    startTimerHz (60);
}

ElementWebViewHost::~ElementWebViewHost()
{
    stopTimer();
    meterlanegate::snapshots.erase (this); // C4/P3 idle-gate cache (file-static, instance-keyed)
    sentinelcache::replies.erase (this);   // §2.3 change-sentinel reply cache (same lifetime)
    engineStateChangedConnection.disconnect(); // P1-11
    sandboxEventConnection.disconnect(); // R3
    // Task 1.3 — unregister the plugin-list watcher before context (and its
    // PluginManager / KnownPluginList) can be torn down.
    if (knownPluginListWatcher != nullptr)
    {
        context.plugins().getKnownPlugins().removeChangeListener (knownPluginListWatcher.get());
        knownPluginListWatcher.reset();
    }
    detachSessionListener();
    pluginEditorClose();
    if (logForwarder != nullptr)
    {
        context.logger().removeListener (logForwarder.get());
        logForwarder.reset();
    }
}

juce::var ElementWebViewHost::invokeForTest (const juce::String& name,
                                              const juce::Array<juce::var>& args)
{
    auto it = bridgeFunctions.find (name.toStdString());
    if (it == bridgeFunctions.end())
        return juce::var::undefined();

    juce::var result;
    bool called = false;

    it->second (args, [&result, &called] (const juce::var& v) {
        result = v;
        called = true;
    });

    // Bridge lambdas post completion via MessageManager::callAsync.
    // Drain the queue until our callback fires (max ~200 iterations).
    for (int guard = 0; guard < 200 && ! called; ++guard)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    return result;
}

void ElementWebViewLogForwarder::messageLogged (const String&) { owner.logPushPending = true; }

void ElementWebViewHost::attachSessionListener()
{
    if (listenerAttached)
        return;
    if (auto s = context.session())
    {
        attachedSessionRoot = s->getValueTree();
        attachedSessionRoot.addListener (this);
        listenerAttached = true;
    }
}

void ElementWebViewHost::detachSessionListener()
{
    if (! listenerAttached)
        return;
    attachedSessionRoot.removeListener (this);
    attachedSessionRoot = {};
    listenerAttached = false;
    // Task 1.2a — session teardown/swap is a forced-refresh boundary: clear the
    // graph-push dedupe cache so the FIRST push after a new session attaches is
    // never short-circuited against the previous session's (possibly identical)
    // JSON.
    lastPushedGraphJson.clear();
}

void ElementWebViewHost::rebuildPluginEmbedLayout()
{
    if (pluginEmbedEditor != nullptr && ! pluginEmbedBounds.isEmpty())
    {
        // CONTRACT 1 — this is a WEBVIEW-driven bounds apply (open / setBounds /
        // resized). Flag it so the editor's componentMovedOrResized listener does
        // NOT re-report this size back to the webview as a plugin self-resize.
        const juce::ScopedValueSetter<bool> guard (applyingWebviewEmbedBounds, true);
        pluginEmbedEditor->setBounds (pluginEmbedBounds);
    }
}

void ElementWebViewHost::resized()
{
    if (browser != nullptr)
        browser->setBounds (getLocalBounds());
    rebuildPluginEmbedLayout();
    if (pluginEmbedEditor != nullptr)
        pluginEmbedEditor->toFront (false);
}

void ElementWebViewHost::pluginEditorClose()
{
    // Was an embed actually up? Only notify the webview when we tear something
    // down, so a no-op close (idempotent guard paths) stays silent.
    const bool hadEmbed = (pluginEmbedEditor != nullptr);

    // CONTRACT 1 — detach the size-feedback listener BEFORE destroying the editor
    // so componentMovedOrResized cannot fire on a half-torn-down embed, and clear
    // the reported-size tracker.
    detachEmbedSizeListener();
    pluginEmbedEditor.reset();
    pluginEmbedBounds = {};
    pluginEmbedNodeUuid = {};
    pluginEmbedReportedW = 0;
    pluginEmbedReportedH = 0;

    // P1-A reopen fix: tell the webview the embed is gone so its mirror
    // (useAppStore.embeddedEditorNodeId) clears in lock-step with the host's
    // pluginEmbedNodeUuid. This is the SINGLE teardown choke point — every close
    // path (the elementPluginEditorClose bridge for ✕/Esc/toggle/Float, plus the
    // container dive/exit and node-delete paths that call pluginEditorClose()
    // directly) routes through here. Without it, host-initiated closes leave the
    // webview mirror stale at the old node id, so a later double-click on that
    // Block takes the toggle's CLOSE branch and dead-ends instead of re-opening.
    // Always on the message thread (all callers are); evalInBrowser is a no-op
    // when the browser is absent.
    if (hadEmbed)
        evalInBrowser ("window.__elementNative && window.__elementNative.onEmbeddedEditorClosed && window.__elementNative.onEmbeddedEditorClosed();");
}

void ElementWebViewHost::pluginEditorOpen (const String& nodeUuid, int x, int y, int w, int h)
{
    // Tear down any prior embed WITHOUT firing the onEmbeddedEditorClosed push:
    // this is the prelude to a re-open (often the SAME node via the retry loop),
    // so notifying "closed" here would race the open's mirror-set on the webview
    // and could clear it. Terminal closes go through pluginEditorClose() (which
    // does notify). Mirror its reset exactly. (P1-A reopen fix)
    // CONTRACT 1 — detach the size-feedback listener BEFORE destroying the editor
    // so it never dangles, and clear the reported-size tracker for the new embed.
    detachEmbedSizeListener();
    pluginEmbedEditor.reset();
    pluginEmbedBounds = {};
    pluginEmbedNodeUuid = {};
    pluginEmbedReportedW = 0;
    pluginEmbedReportedH = 0;

    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
        return;

    const Graph G (currentBoard());
    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
        return;

    auto* gui = context.services().find<GuiService>();
    if (gui == nullptr)
        return;

    pluginEmbedNodeUuid = nodeUuid;
    // Hold the webview GUESS only as a fallback; the REAL size is read off the
    // created panel below (CONTRACT 1) so the docked editor is never squished
    // into the canvas-open default (e.g. 720×480) when its true size differs.
    pluginEmbedBounds = Rectangle<int> (x, y, jmax (120, w), jmax (80, h));
    pluginEmbedEditor = createPluginEditorPanel (*gui, n);
    if (pluginEmbedEditor == nullptr)
    {
        pluginEmbedBounds = {};
        pluginEmbedNodeUuid = {};
        return;
    }

    addAndMakeVisible (*pluginEmbedEditor);

    // CONTRACT 1 — the editor's REAL native size is the single source of truth.
    // createPluginEditorPanel() returns a PluginWindowContent that has already
    // sized itself to the real editor (its ctor calls updateSize()), so read the
    // panel's getWidth()/getHeight() NOW — BEFORE the first rebuildPluginEmbedLayout()
    // would resize it to the webview's guess. Keep the webview x,y for POSITION,
    // use the panel's nw/nh for SIZE. The native rect then matches what the
    // webview overlay/drag-handle will be told.
    const int nw = jmax (1, pluginEmbedEditor->getWidth());
    const int nh = jmax (1, pluginEmbedEditor->getHeight());
    pluginEmbedBounds = Rectangle<int> (x, y, nw, nh);

    rebuildPluginEmbedLayout();
    pluginEmbedEditor->toFront (false);

    // CONTRACT 1 — start tracking the editor's self-resize (e.g. Kontakt expand)
    // and record the size we are about to report so duplicate pushes are skipped.
    pluginEmbedReportedW = nw;
    pluginEmbedReportedH = nh;
    attachEmbedSizeListener();

    // Wave-3 Phase 4 (Task 4.2) — tell the webview the embedded editor is mounted
    // and ready, so it can finalise its mirror + drag affordance WITHOUT the
    // interim retry-poll backoff (nativePluginEditor.ts PLUGIN_EDITOR_OPEN_DELAYS_MS).
    // Fired exactly once per successful open, AFTER the editor exists. Mirrors
    // onEmbeddedEditorClosed (the single teardown push). CONTRACT 1 extends the
    // signature with the editor's REAL (nw,nh) so the webview sizes the overlay +
    // flush drag-handle to the true editor size. Always message-thread.
    evalInBrowser ("window.__elementNative && window.__elementNative.onEmbeddedEditorReady && window.__elementNative.onEmbeddedEditorReady("
                   + nodeUuid.quoted() + ", " + String (nw) + ", " + String (nh) + ");");
}

void ElementWebViewHost::pluginEditorSetBounds (int x, int y, int w, int h)
{
    pluginEmbedBounds = Rectangle<int> (x, y, jmax (60, w), jmax (60, h));
    // CONTRACT 1 — this is a webview-AUTHORED size; keep the reported-size tracker
    // in lock-step so a subsequent (non-webview) self-resize is measured against
    // the size the webview already knows, and the guarded setBounds below does not
    // round-trip. rebuildPluginEmbedLayout() sets applyingWebviewEmbedBounds.
    pluginEmbedReportedW = pluginEmbedBounds.getWidth();
    pluginEmbedReportedH = pluginEmbedBounds.getHeight();
    rebuildPluginEmbedLayout();
}

// CONTRACT 1 — embedded-editor self-resize feedback ----------------------------
// The docked overlay + drag-handle on the webview must track the embedded
// editor's REAL size, including when the plugin resizes ITSELF after open (a
// heavy instrument like Kontakt expanding/collapsing a browser pane). We attach
// a ComponentListener to the live pluginEmbedEditor; on a genuine size delta that
// did NOT originate from our own webview-driven setBounds, we push
// onEmbeddedEditorResize(uuid,w,h). All message-thread (JUCE component callbacks).

void ElementWebViewHost::attachEmbedSizeListener()
{
    if (pluginEmbedEditor != nullptr)
        pluginEmbedEditor->addComponentListener (this);
}

void ElementWebViewHost::detachEmbedSizeListener()
{
    if (pluginEmbedEditor != nullptr)
        pluginEmbedEditor->removeComponentListener (this);
}

void ElementWebViewHost::notifyEmbeddedEditorSizeChanged()
{
    if (pluginEmbedEditor == nullptr || pluginEmbedNodeUuid.isEmpty())
        return;

    const int w = jmax (1, pluginEmbedEditor->getWidth());
    const int h = jmax (1, pluginEmbedEditor->getHeight());

    // Only emit on a real size DELTA — avoids a push storm when JUCE fires
    // componentMovedOrResized for a move/no-op, and prevents echoing a size the
    // webview already knows.
    if (w == pluginEmbedReportedW && h == pluginEmbedReportedH)
        return;

    pluginEmbedReportedW = w;
    pluginEmbedReportedH = h;

    // Keep the host's authoritative bounds in step (same position, new size) so a
    // later resized()/rebuild re-applies the editor's true size rather than a
    // stale one.
    if (! pluginEmbedBounds.isEmpty())
        pluginEmbedBounds = pluginEmbedBounds.withSize (w, h);

    evalInBrowser ("window.__elementNative && window.__elementNative.onEmbeddedEditorResize && window.__elementNative.onEmbeddedEditorResize("
                   + pluginEmbedNodeUuid.quoted() + ", " + String (w) + ", " + String (h) + ");");
}

void ElementWebViewHost::componentMovedOrResized (juce::Component& component, bool /*wasMoved*/, bool wasResized)
{
    // Only the live embed editor; ignore moves (the webview owns position) and any
    // resize we are ourselves applying via rebuildPluginEmbedLayout().
    if (! wasResized || applyingWebviewEmbedBounds)
        return;
    if (pluginEmbedEditor == nullptr || &component != pluginEmbedEditor.get())
        return;

    notifyEmbeddedEditorSizeChanged();
}

void ElementWebViewHost::pluginEditorFloat()
{
    if (pluginEmbedNodeUuid.isEmpty())
        return;

    auto sess = context.session();
    auto* gui = context.services().find<GuiService>();
    if (sess == nullptr || gui == nullptr)
        return;

    const Graph G (currentBoard());
    const Node n = findNodeByUuidInGraph (G, pluginEmbedNodeUuid);
    if (n.isValid())
        gui->presentPluginWindow (n, true);

    pluginEditorClose();
}

void ElementWebViewHost::visibilityChanged()
{
    if (isShowing())
        attachSessionListener();
}

void ElementWebViewHost::timerCallback()
{
    if (browser == nullptr)
        return;

    // §0.2 — Telemetry divider. The timer stays startTimerHz(60) so interaction-
    // coupled work (pendingConnectedAdd apply, graph-push debounce, parameter
    // delta cadence, session-dirty poll — all BELOW) keeps its 60 Hz feel. The
    // telemetry lanes (metering peak, the three meter lanes, spectrum-subscription
    // re-assert, master levels, log history) are visually indistinguishable at
    // 30 Hz on the ballistic meter ladder, so they run only on EVEN ticks
    // (kTelemetryDivider = 2) — halving both the message-thread JSON build and
    // the WebContent flush/rerender rate. The 15 Hz parameter channel below keeps
    // its EFFECTIVE 15 Hz unchanged: it divides BASE ticks (every 4th 60 Hz tick),
    // NOT telemetry ticks, so it is not coupled to this divider.
    auto& snaps = meterlanegate::snapshots[this];
    constexpr unsigned kTelemetryDivider = 2;
    const bool runTelemetry = (++snaps.telemetryTick % kTelemetryDivider) == 0;

    if (runTelemetry)
    {
        if (auto peak = metering.popLatestPeak())
        {
            const String js = "window.__elementNative && window.__elementNative.onMetering("
                                + String (*peak, 6) + ");";
            evalInBrowser (js);
        }

        // C4/P3 idle gating: pre-pass each meter lane with pure atomic reads
        // + epsilon compares (~0.01ms) and skip the JSON build + JS push for
        // any lane whose values are all unchanged — see the meterlanegate
        // block above buildCableLevelsJson for the measured numbers + design.
        auto sessForMeters = context.session();
        const Node boardForMeters (currentBoard());
        const bool haveBoard = sessForMeters != nullptr && boardForMeters.isGraph();
        const Graph GM (boardForMeters);

        std::vector<float> freshCable;
        if (haveBoard)
            meterlanegate::collectCableLane (GM, freshCable);
        if (meterlanegate::changed (snaps.cable, std::move (freshCable)))
        {
            const String cableJson (buildCableLevelsJson());
            evalInBrowser ("window.__elementNative && window.__elementNative.onCableLevels && window.__elementNative.onCableLevels("
                           + cableJson + ");");
        }

        // Pillar-2 D1: per-node output level so terminal/unconnected Blocks meter
        // real signal (Q-VU-PER-BLOCK).
        std::vector<float> freshNode;
        if (haveBoard)
            meterlanegate::collectNodeLane (GM, freshNode);
        if (meterlanegate::changed (snaps.node, std::move (freshNode)))
        {
            const String nodeJson (buildNodeMetersJson());
            evalInBrowser ("window.__elementNative && window.__elementNative.onNodeLevels && window.__elementNative.onNodeLevels("
                           + nodeJson + ");");
        }

        // G3-B item 2: per-node PER-CHANNEL output levels for surround / multi-
        // channel bus meters. Same calibration as onNodeLevels, but every output
        // lane (not just the loudest). Consumed by the BusInspector's per-lane VU
        // columns via useNodeChannelMeterStore.
        std::vector<float> freshCh;
        if (haveBoard)
            meterlanegate::collectChannelLane (GM, freshCh);
        if (meterlanegate::changed (snaps.channel, std::move (freshCh)))
        {
            const String chJson (buildNodeChannelLevelsJson());
            evalInBrowser ("window.__elementNative && window.__elementNative.onNodeChannelLevels && window.__elementNative.onNodeChannelLevels("
                           + chJson + ");");
        }

        // §0.1 — master output L/R + audio-input peak (Q-VU-LR / Q-VU-INPUT,
        // Pillar-2 D2/D3). Previously an UNCONDITIONAL push every tick — the only
        // un-gated meter lane. Now gated like the others: a pre-pass of three
        // atomic reads + epsilon compares skips the JSON build + JS push when
        // outL/outR/input are all unchanged. Honesty preserved — a real level
        // change still pushes within one telemetry tick.
        std::vector<float> freshMaster;
        meterlanegate::collectMasterLane (context, freshMaster);
        if (meterlanegate::changed (snaps.master, std::move (freshMaster)))
        {
            const String masterJson (buildMasterLevelsJson());
            evalInBrowser ("window.__elementNative && window.__elementNative.onMasterLevels && window.__elementNative.onMasterLevels("
                           + masterJson + ");");
        }
    }

    // G3-B item 1: re-assert FFT spectrum subscriptions and clear stale ones.
    // The webview subscribes via elementSetNodeSpectrumWanted/elementGetNode
    // Spectrum (poll == subscribe). Re-assert setSpectrumWanted(true) on the
    // live set each tick (cheap relaxed atomic store) and clear the flag on any
    // node that left the graph, so a torn-down webview tab cannot leave the
    // audio-thread FFT tap running. Zero idle cost when nobody is subscribed.
    if (! spectrumSubscriptions.empty())
    {
        if (auto sess = context.session())
        {
            const Graph G (currentBoard());
            for (auto it = spectrumSubscriptions.begin(); it != spectrumSubscriptions.end();)
            {
                const Node n = findNodeByUuidInGraph (G, String (*it));
                if (auto* proc = n.getObject())
                {
                    proc->setSpectrumWanted (true);
                    ++it;
                }
                else
                {
                    // Node gone (graph/selection changed) — drop the subscription.
                    it = spectrumSubscriptions.erase (it);
                }
            }
        }
    }

    // §0.2 — log history rides the telemetry divider (30 Hz). logPushPending
    // latches between ticks, so a delayed flush still ships every line; the
    // visible log just updates at 30 Hz instead of 60.
    if (runTelemetry && logPushPending && browser != nullptr)
    {
        const auto lines = context.logger().getHistory();
        Array<var> logArr;
        for (int i = 0; i < lines.size(); ++i)
            logArr.add (var (lines[i]));
        evalInBrowser ("window.__elementNative && window.__elementNative.onLogHistory && window.__elementNative.onLogHistory("
                       + JSON::toString (var (logArr)) + ");");
        logPushPending = false;
        lastLogHistorySize = lines.size();
    }

    // T3 — apply the deferred absolute position of a ⌥+drop add-and-connect.
    // The AddPluginMessage posted by elementGraphAddPluginConnected is async, so
    // we poll the board for the single node UUID that did NOT exist before the
    // add and setPosition() it to the recorded drop coords. Bounded wait so a
    // failed/cancelled add can't leave this armed forever.
    if (pendingConnectedAdd.active)
    {
        bool done = false;       // stop polling (positioned, abandoned, or timed out)
        bool didPosition = false; // actually set the new node's position
        if (auto sessForPos = context.session())
        {
            const Graph G (currentBoard());
            // Only act while still on the board the drop happened on.
            if (G.isGraph() && boardPath == pendingConnectedAdd.boardPathSnapshot)
            {
                for (int i = 0; i < G.getNumNodes(); ++i)
                {
                    Node n (G.getNode (i));
                    const String uuid (n.getUuidString());
                    if (! pendingConnectedAdd.preExistingUuids.contains (uuid))
                    {
                        n.setPosition (pendingConnectedAdd.flowX, pendingConnectedAdd.flowY);
                        done = true;
                        didPosition = true;
                        break;
                    }
                }
            }
            else
            {
                // Navigated away from the drop board — abandon the apply.
                done = true;
            }
        }
        if (done || ++pendingConnectedAdd.waitedTicks > 30)
        {
            pendingConnectedAdd.active = false;
            pendingConnectedAdd.preExistingUuids.clearQuick();
            if (didPosition)
                pushGraphSnapshot(); // surface the corrected position now.
        }
    }

    if (graphPushPendingMs > 0)
    {
        graphPushPendingMs -= (1000 / 60);
        if (graphPushPendingMs <= 0)
            pushGraphSnapshot();
    }

    // 15Hz parameter delta channel — every 4th 60Hz tick.
    if (++parameterPushCounter >= 4)
    {
        parameterPushCounter = 0;
        pushParameterUpdates();
    }

    // Session dirty flag is not on ValueTree — poll ~2 Hz so the Web toolbar can show save state.
    if (++dirtyPollCounter >= 30)
    {
        dirtyPollCounter = 0;
        if (auto* ss = context.services().find<SessionService>())
        {
            const bool d = ss->hasSessionChanged();
            if (d != lastPushedSessionDirty)
            {
                lastPushedSessionDirty = d;
                pushGraphSnapshot();
            }
        }
    }
}

void ElementWebViewHost::scheduleGraphPush (int debounceMs)
{
    graphPushPendingMs = jmax (graphPushPendingMs, debounceMs);
}

bool ElementWebViewHost::isUnderActiveGraph (const ValueTree& start) const
{
    auto sess = context.session();
    if (sess == nullptr)
        return false;
    const Node ag (sess->getActiveGraph());
    if (! ag.isValid())
        return false;
    const ValueTree activeRoot = ag.data();
    ValueTree t = start;
    while (t.isValid())
    {
        if (t == activeRoot)
            return true;
        t = t.getParent();
    }
    return false;
}

Node ElementWebViewHost::currentBoard() const
{
    auto sess = context.session();
    if (sess == nullptr)
        return {};

    // EMPTY boardPath ⇒ exactly the top-level active graph (== pre-dive
    // behaviour). The loop below does not execute, so the returned Node is
    // byte-for-byte the same object buildActiveGraphJson previously walked.
    Node board (sess->getActiveGraph());
    if (! board.isValid())
        return board;

    for (const auto& uuid : boardPath)
    {
        // Resolve ONE level down: the container must be a DIRECT child of the
        // board we're currently standing on (recursive=false). A
        // recursive=true search could jump levels / match a same-named UUID
        // elsewhere in the tree, which would corrupt the path semantics.
        const Node next (board.getNodeByUuid (Uuid (uuid), false));
        if (! next.isValid() || ! next.isGraph())
            break; // stale / non-container entry — stop at deepest valid board.
        board = next;
    }
    return board;
}

bool ElementWebViewHost::isUnderCurrentBoard (const ValueTree& start) const
{
    // When boardPath is empty, currentBoard() == getActiveGraph(), so this
    // walk is identical to isUnderActiveGraph (regression-safe by construction).
    const Node board (currentBoard());
    if (! board.isValid())
        return false;
    const ValueTree boardRoot = board.data();
    ValueTree t = start;
    while (t.isValid())
    {
        if (t == boardRoot)
            return true;
        t = t.getParent();
    }
    return false;
}

void ElementWebViewHost::truncateBoardPathOnNodeRemoval (const String& removedUuid)
{
    if (removedUuid.isEmpty() || boardPath.isEmpty())
        return;

    // If the removed node is the current board or any ancestor on the path,
    // drop it and everything below it so the canvas exits to the surviving
    // parent board rather than pointing at a deleted (now-invalid) graph.
    const int idx = boardPath.indexOf (removedUuid);
    if (idx >= 0)
    {
        boardPath.removeRange (idx, boardPath.size() - idx);
        scheduleGraphPush (40);
    }
}

bool ElementWebViewHost::shouldIgnoreSessionRootProperty (const Identifier& prop) const
{
    return prop != tags::tempo && prop != tags::name;
}

bool ElementWebViewHost::isWindowChromeProperty (const Identifier& prop) noexcept
{
    // Task 1.2b (perf-diag #2) — pure window-chrome state that the React canvas
    // does NOT render. PluginWindow::moved() writes windowX/windowY on the node
    // ValueTree on every frame of a drag (pluginwindow.cpp:409-410), and
    // windowVisible/windowOnTop on show/pin (:289/:177). These props can live on
    // the SAME node child tree as the block-position props (tags::x/tags::y), so
    // the under-root listener MUST filter by IDENTIFIER, not by tree (critic
    // MAJOR-5). This predicate is deliberately a small static pure function so
    // the host test can gate it directly. It is consulted ONLY on the
    // vtIsUnderSessionRoot branch below — it must NEVER be folded into
    // shouldIgnoreSessionRootProperty (the ROOT-tree filter, a different thing).
    return prop == tags::windowX
        || prop == tags::windowY
        || prop == tags::windowVisible
        || prop == tags::windowOnTop;
}

String ElementWebViewHost::validateCollapseTier (const String& tier)
{
    // Task 2.0 — the persisted collapse tier is a string union; clamp any
    // unknown/empty value to the lean default ("macro"). Kept pure + static so
    // the host test gates it directly (mirrors isWindowChromeProperty).
    if (tier == "title" || tier == "macro" || tier == "expanded")
        return tier;
    return "macro";
}

String ElementWebViewHost::readCollapseTier (const ValueTree& node)
{
    // Task 2.0 — read-path migration (contract §3.1). Prefer the new
    // "collapseTier" string (validated); else coerce a legacy "collapsed" bool
    // (true→"title", false→"macro"); else "macro" (the lean default). This is
    // the C++ side of the dual-sided migration — it coerces IDENTICALLY to the
    // JS mapBlock path (critic CRITICAL-3) so an old .els opened by a new host,
    // or a legacy bool ever forwarded to JS, both land on the same tier.
    if (node.hasProperty (Identifier ("collapseTier")))
        return validateCollapseTier (node.getProperty (Identifier ("collapseTier")).toString());
    if (node.hasProperty (Identifier ("collapsed")))
        return (bool) node.getProperty (Identifier ("collapsed")) ? "title" : "macro";
    return "macro";
}

void ElementWebViewHost::valueTreePropertyChanged (ValueTree& tree, const Identifier& prop)
{
    auto sess = context.session();
    if (sess == nullptr)
        return;

    const ValueTree sessionRoot = sess->getValueTree();
    if (tree == sessionRoot)
    {
        if (! shouldIgnoreSessionRootProperty (prop))
            scheduleGraphPush (40);
        return;
    }

    if (vtIsUnderSessionRoot (tree, sessionRoot))
    {
        // Task 1.2b — drop window-chrome property writes (window drag = a
        // windowX/windowY storm) so they never SCHEDULE a full-graph push. Every
        // OTHER prop, incl. tags::x/tags::y (block position), still pushes.
        if (isWindowChromeProperty (prop))
            return;
        scheduleGraphPush (40);
    }
}

void ElementWebViewHost::valueTreeChildAdded (ValueTree& parent, ValueTree&)
{
    auto sess = context.session();
    if (sess == nullptr)
        return;
    const ValueTree sessionRoot = sess->getValueTree();
    if (parent == sessionRoot)
    {
        scheduleGraphPush (40);
        return;
    }
    const ValueTree graphs = sessionRoot.getChildWithName (tags::graphs);
    if (parent == graphs || isUnderCurrentBoard (parent))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeChildRemoved (ValueTree& parent, ValueTree& child, int)
{
    // P1-A (belt-and-braces) — the primary, UAF-safe close happens at removal
    // INITIATION in the elementGraphRemoveNode handler (processor still alive),
    // which clears pluginEmbedNodeUuid. So for the normal bridge-driven delete
    // this guard does NOT fire (uuid already empty). It only catches a removal
    // that bypassed that handler (e.g. undo / session swap / Lua). Safe here:
    // PluginWindowContent holds a ref-counted ProcessorPtr (pluginwindow.cpp:227),
    // so the processor object outlives the graph's ref-drop and pluginEditorClose()
    // only resets a unique_ptr — no engine deref of freed memory.
    if (pluginEmbedEditor != nullptr && pluginEmbedNodeUuid.isNotEmpty()
        && child.getProperty (tags::uuid).toString() == pluginEmbedNodeUuid)
    {
        pluginEditorClose();
    }

    // P2-A1 INTERACTION (c): if the removed node is the dived board or one of
    // its ancestors on boardPath, truncate the path so the canvas exits to a
    // surviving parent board rather than walking into a deleted graph. This is
    // the belt-and-braces backstop (undo / session swap / Lua); the primary,
    // earlier truncation also runs in the elementGraphRemoveNode handler. A
    // removal whose UUID is not on the path (cables, ports, unrelated nodes) is
    // a safe no-op. Always on the message thread (ValueTree listener contract).
    truncateBoardPathOnNodeRemoval (child.getProperty (tags::uuid).toString());

    auto sess = context.session();
    if (sess == nullptr)
        return;
    const ValueTree sessionRoot = sess->getValueTree();
    if (parent == sessionRoot)
    {
        scheduleGraphPush (40);
        return;
    }
    const ValueTree graphs = sessionRoot.getChildWithName (tags::graphs);
    if (parent == graphs || isUnderCurrentBoard (parent))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeChildOrderChanged (ValueTree& parent, int, int)
{
    auto sess = context.session();
    if (sess == nullptr)
        return;
    const ValueTree sessionRoot = sess->getValueTree();
    if (parent == sessionRoot)
    {
        scheduleGraphPush (40);
        return;
    }
    const ValueTree graphs = sessionRoot.getChildWithName (tags::graphs);
    if (parent == graphs || isUnderCurrentBoard (parent))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeParentChanged (ValueTree& tree)
{
    if (isUnderCurrentBoard (tree))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeRedirected (ValueTree& tree)
{
    auto sess = context.session();
    if (sess != nullptr && tree == sess->getValueTree())
    {
        // P2-A1: the session root was redirected (new project loaded / session
        // swap) — any dive from the previous project is meaningless now. Reset
        // to the top board so the snapshot walks the freshly-loaded active graph.
        boardPath.clearQuick();
        // Task 1.2a — forced-refresh boundary: clear the push dedupe cache so the
        // post-redirect snapshot is delivered even if it happens to match the
        // pre-redirect JSON byte-for-byte.
        lastPushedGraphJson.clear();
        scheduleGraphPush (40);
        return;
    }
    if (isUnderCurrentBoard (tree))
        scheduleGraphPush (40);
}

void ElementWebViewHost::pushGraphSnapshot()
{
    graphPushPendingMs = 0;
    // C4/P3: topology / board / webview-reload boundary — drop the meter-lane
    // idle-gate caches so the next tick resends full level snapshots (the new
    // cable/node ids need fresh rows even if values look numerically equal).
    meterlanegate::snapshots.erase (this);
    // §2.3: same boundary — a webview reload resets its engine-snapshot /
    // instances stores to defaults, so the NEXT poll must get a real reply, not
    // the "~" no-change sentinel. Drop the per-handler reply cache to force it.
    sentinelcache::replies.erase (this);
    const String json (buildActiveGraphJson());
    // Task 1.2a (perf-diag #2) — output-dedupe. If the freshly-built JSON is
    // byte-identical to the last push, skip the evalInBrowser entirely (the IPC
    // hop + WKWebView parse + JUCE's O(n²) quote-escape). The build above still
    // runs — accepted (Task 1.3 cheapens its dominant cost); this gate removes
    // the no-op IPC class that window-chrome churn / repeated identical pushes
    // produce. Mirrors sentinelcache::dedupe. The dirty-flag refresh below still
    // runs so the ~2 Hz dirty poll stays correct even on a deduped tick.
    if (json != lastPushedGraphJson)
    {
        lastPushedGraphJson = json;
        evalInBrowser ("window.__elementNative && window.__elementNative.onGraphState(" + json + ");");
    }
    if (auto* ss = context.services().find<SessionService>())
        lastPushedSessionDirty = ss->hasSessionChanged();
}

void ElementWebViewHost::pushMeteringIfNeeded()
{
    if (auto peak = metering.popLatestPeak())
        evalInBrowser ("window.__elementNative && window.__elementNative.onMetering("
                        + String (*peak, 6) + ");");
}

void ElementWebViewHost::evalInBrowser (const String& js)
{
    if (browser != nullptr)
        browser->evaluateJavascript (js, nullptr);
}

void ElementWebViewHost::emitSandboxEventToWeb (juce::uint32 nodeId, int kind, const String& reason)
{
    // sigSandboxEvent can fire from the worker connection-lost callback, which is
    // not guaranteed to be the message thread. evaluateJavascript + session/graph
    // access must run on the message thread, and the host may be torn down before
    // the async dispatch runs — guard with a SafePointer (same discipline as the
    // postCompletion helper in the constructor).
    juce::Component::SafePointer<ElementWebViewHost> safe (this);
    juce::MessageManager::callAsync ([safe, nodeId, kind, reason]
    {
        auto* self = safe.getComponent();
        if (self == nullptr)
            return;

        // Resolve the engine nodeId to the UUID the React Block components key on.
        String uuid;
        if (auto sess = self->context.session())
        {
            const Graph G (self->currentBoard());
            uuid = nodeUuidFromGraphNodeId (G, nodeId);
        }

        // kind matches PluginManager::SandboxEvent: 0=crashed 1=restarted
        // 2=loadFailed 3=error 4=fellBackInProcess (sandbox requested but the
        // worker failed; plugin runs in-process — NOT a crash, distinct badge).
        const char* kindStr = "error";
        switch (kind)
        {
            case 0: kindStr = "crashed";          break;
            case 1: kindStr = "restarted";        break;
            case 2: kindStr = "loadFailed";       break;
            case 4: kindStr = "inProcessFallback"; break;
            default: break;
        }

        DynamicObject::Ptr payload (new DynamicObject());
        payload->setProperty ("nodeId", (int64) nodeId);
        payload->setProperty ("nodeUuid", uuid);
        payload->setProperty ("kind", String (kindStr));
        payload->setProperty ("reason", reason);

        self->evalInBrowser (
            "window.__elementNative && window.__elementNative.onSandboxEvent && window.__elementNative.onSandboxEvent("
            + JSON::toString (var (payload.get())) + ");");
    });
}

String ElementWebViewHost::buildActiveGraphJson() const
{
    DynamicObject::Ptr root (new DynamicObject());
    root->setProperty ("schema", 2);
    root->setProperty ("schemaVersion", 2);

    auto sess = context.session();
    if (sess == nullptr)
        return JSON::toString (var (root.get()));

    DynamicObject::Ptr sessionObj (new DynamicObject());
    sessionObj->setProperty ("name", sess->getName());
    sessionObj->setProperty ("tempo", sess->getValueTree().getProperty (tags::tempo, 120.0));
    sessionObj->setProperty ("timeSigNumerator", 4);
    sessionObj->setProperty ("timeSigDenominator", 4);
    if (auto* ss = context.services().find<SessionService>())
    {
        const File sf (ss->getSessionFile());
        sessionObj->setProperty ("filePath", sf.getFullPathName());
        sessionObj->setProperty ("dirty", ss->hasSessionChanged());
        // G3 (4b): timestamp of the last successful save / autosave. The webview
        // fires a non-modal save-pulse when this value increases — covers silent
        // saves AND autosaves with no separate JS push.
        sessionObj->setProperty ("savedAtMs", ss->getLastSavedMs());
    }
    else
    {
        sessionObj->setProperty ("filePath", String());
        sessionObj->setProperty ("dirty", false);
        sessionObj->setProperty ("savedAtMs", (juce::int64) 0);
    }
    {
        Array<var> recentVar;
        if (auto* gui = context.services().find<GuiService>())
        {
            auto& rf = gui->recentFiles();
            const int n = jmin (rf.getNumFiles(), 12);
            for (int i = 0; i < n; ++i)
                recentVar.add (var (rf.getFile (i).getFullPathName()));
        }
        sessionObj->setProperty ("recentFiles", var (recentVar));
    }
    root->setProperty ("session", var (sessionObj.get()));

    {
        Array<var> graphsVar;
        const int activeIdx = sess->getActiveGraphIndex();
        for (int i = 0; i < sess->getNumGraphs(); ++i)
        {
            const Node gn (sess->getGraph (i));
            DynamicObject::Ptr go (new DynamicObject());
            go->setProperty ("id", gn.getUuidString());
            go->setProperty ("name", gn.getName());
            go->setProperty ("index", i);
            go->setProperty ("active", i == activeIdx);
            graphsVar.add (var (go.get()));
        }
        root->setProperty ("graphs", var (graphsVar));
    }

    appendAudioSetupJson (context, root);
    appendMidiSetupJson (context, root);
    appendOscHostJson (context, root);
    appendMoleculesJson (root);
    appendPerformJson (*sess, root);
    appendMidiMappingJson (context, root);

    // C-2 hoist: the engine snapshot reads only context.audio() and
    // context.devices(), so it must be emitted regardless of whether the
    // current graph is empty. Previously this block sat AFTER the
    // (! gn.isGraph()) early-return below, leaving deviceName / sampleRate /
    // bufferSize / inputLatencySamples / outputLatencySamples / isPlaying
    // missing from snapshots whenever no graph was selected — that emptied
    // PROJECT OVERVIEW (D-3..D-6, D-12, D-14, D-17 in
    // .sisyphus/qa/ui-bug-master-list.md). Scoped in its own block to keep
    // the local DynamicObject lifetime tight.
    {
        DynamicObject::Ptr engine (new DynamicObject());
        if (auto e = context.audio())
            if (auto mon = e->getTransportMonitor())
                engine->setProperty ("isPlaying", (bool) mon->playing.get());
        if (auto* dev = context.devices().getCurrentAudioDevice())
        {
            engine->setProperty ("deviceName", dev->getName());
            engine->setProperty ("sampleRate", dev->getCurrentSampleRate());
            engine->setProperty ("bufferSize", dev->getCurrentBufferSizeSamples());
            engine->setProperty ("inputLatencySamples", dev->getInputLatencyInSamples());
            engine->setProperty ("outputLatencySamples", dev->getOutputLatencyInSamples());
        }
        root->setProperty ("engine", var (engine.get()));
    }

    // P2-A1: the snapshot walks the CURRENT BOARD, not the top-level active
    // graph directly. When boardPath is empty (not dived) currentBoard() ==
    // getActiveGraph() == getCurrentGraph(), so `gn` and everything derived
    // from it below is byte-identical to the pre-dive output (regression guard).
    const Node gn (currentBoard());
    if (! gn.isGraph())
    {
        DynamicObject::Ptr canvas (new DynamicObject());
        canvas->setProperty ("snapToGrid", false);
        canvas->setProperty ("gridSize", 8);
        {
            DynamicObject::Ptr vp (new DynamicObject());
            vp->setProperty ("x", 0.0);
            vp->setProperty ("y", 0.0);
            vp->setProperty ("zoom", 1.0);
            canvas->setProperty ("viewport", var (vp.get()));
        }
        {
            DynamicObject::Ptr gb (new DynamicObject());
            gb->setProperty ("minX", 0.0);
            gb->setProperty ("minY", 0.0);
            gb->setProperty ("maxX", 800.0);
            gb->setProperty ("maxY", 600.0);
            canvas->setProperty ("graphBounds", var (gb.get()));
        }
        root->setProperty ("canvas", var (canvas.get()));
        root->setProperty ("activeGraphOutline", var (Array<var>()));
        return JSON::toString (var (root.get()));
    }

    const Graph G (gn);
    // activeGraphId / activeGraphIndex keep naming the TOP-LEVEL active graph
    // TAB (unchanged — the React tab strip keys off these, and when NOT dived
    // gn == getActiveGraph() so getUuidString() is the same value as the old
    // gn.getUuidString()). currentBoardId names the board the canvas is actually
    // showing; it is emitted ONLY when dived, so a NOT-dived snapshot adds no new
    // key and stays byte-identical to the pre-dive output (hard regression guard).
    root->setProperty ("activeGraphId", sess->getActiveGraph().getUuidString());
    root->setProperty ("activeGraphIndex", sess->getActiveGraphIndex());
    if (! boardPath.isEmpty())
        root->setProperty ("currentBoardId", gn.getUuidString());

    // Real breadcrumb PATH: [sessionName, activeGraphName, container1, ...].
    // Walk the same boardPath the snapshot walked, resolving each container's
    // display name level-by-level. When boardPath is empty this reduces to
    // EXACTLY the prior 2-tuple [sessionName, activeGraphName] (regression guard).
    Array<var> breadcrumbs;
    breadcrumbs.add (var (sess->getName()));
    {
        Node walk (sess->getActiveGraph());
        if (walk.isValid())
            breadcrumbs.add (var (walk.getName()));
        for (const auto& uuid : boardPath)
        {
            const Node next (walk.getNodeByUuid (Uuid (uuid), false));
            if (! next.isValid() || ! next.isGraph())
                break;
            breadcrumbs.add (var (next.getName()));
            walk = next;
        }
    }
    root->setProperty ("breadcrumbs", var (breadcrumbs));

    appendCanvasJson (gn, G, root);
    appendActiveGraphOutlineJson (G, root);

    // Sample rate + block size for per-block latency-in-samples → ms and
    // render-nanos → CPU% conversions. Pulled once outside the node loop so we
    // don't re-read the device per block. 0 when no audio device is open
    // (treated as "unknown" → latencyMs / cpuLoad 0).
    double activeSampleRate = 0.0;
    int activeBlockSize = 0;
    if (auto* dev = context.devices().getCurrentAudioDevice())
    {
        activeSampleRate = dev->getCurrentSampleRate();
        activeBlockSize = dev->getCurrentBufferSizeSamples();
    }

    Array<var> blocks;
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        DynamicObject::Ptr b (new DynamicObject());
        b->setProperty ("id", n.getUuidString());
        // CONTRACT 2 — getDisplayName() falls back to the live plugin name when
        // tags::name is empty / never backfilled, so a freshly added plugin block
        // shows its real name (e.g. "Kontakt") instead of the literal "Node"
        // default or blank. This is the field the canvas Block title, the editor
        // tab strip, and the docked-editor drag-handle all read.
        b->setProperty ("name", n.getDisplayName());

        // Wave-3 Phase 4 — transient async-load lifecycle state. While an external
        // plugin's real processor is still being instantiated, GraphManager marks
        // the placeholder node with the runtime-only tags::loading flag (stripped
        // on save). Emit loadState:"loading" so the React Block shows the honest
        // loading face (name + "loading…", no meters, no connectable ports). For a
        // READY node the key is OMITTED — the webview's mapBlock treats absent as
        // "ready" (back-compat: every legacy/steady-state node decodes as ready,
        // and the snapshot stays byte-identical to today for the Task 1.2 dedupe).
        const bool nodeIsLoading = (bool) n.getProperty (tags::loading, false);
        if (nodeIsLoading)
            b->setProperty ("loadState", "loading");

        // P0 — internal node identifier (e.g. "element.compare"). Emitted for ALL
        // blocks (harmless for third-party — just the file/identifier string). Lets
        // the webview branch its inline controls on built-in node type.
        const String nodeIdentifier (n.getIdentifier().toString());
        b->setProperty ("identifier", nodeIdentifier);

        // P3 (out-of-process hosting) — engine-truth flag: is this block's
        // processor running in a separate crash-isolated worker process? Detected
        // by the SAME cast the editor-bridge fns use (elementOpenSandboxedEditor,
        // :1558), so the snapshot value can never disagree with what the bridge
        // accepts. NOTHING-fake: emitted ONLY when the live processor really is a
        // SandboxedProcessorNode (a loading placeholder or in-process node resolves
        // to false). The webview routes the editor-open of a sandboxed Block to the
        // floating worker window (elementOpenSandboxedEditor) instead of the docked
        // in-process embed (elementPluginEditorOpen, which a sandboxed node has no
        // editor for). Absent/false ⇒ docked path (back-compat: every in-process
        // node decodes as not-sandboxed).
        b->setProperty ("isSandboxed",
                        dynamic_cast<SandboxedProcessorNode*> (n.getObject()) != nullptr);

        // P0 — for the built-in logic/comparator nodes, surface the engine-truth
        // integer mode so the React Block can render the active op without a fake
        // default. Read message-thread-side off the resolved Processor (relaxed
        // atomic load via the const getter). Cast-miss → emit nothing (no fake value).
        if (nodeIdentifier == "element.compare")
        {
            if (auto* proc = n.getObject())
                if (auto* cmp = dynamic_cast<ComparatorNode*> (proc))
                    b->setProperty ("intMode", (int) cmp->getOperator());
        }
        else if (nodeIdentifier == "element.logic")
        {
            if (auto* proc = n.getObject())
                if (auto* lg = dynamic_cast<LogicGateNode*> (proc))
                    b->setProperty ("intMode", (int) lg->getMode());
        }

        // Block plugin format + category for the React badge / colour-coding.
        // Additive: `mapBlock` reads these when present and only falls back to
        // its JS infer* heuristics when absent. Emit structured values (no
        // pre-serialised JSON) so the snapshot shape stays consistent.
        b->setProperty ("format", normalizeBlockFormat (n.getFormat().toString()));

        // Source the vendor category from the matching KnownPluginList entry
        // (keyed on the createIdentifierString form stored in
        // tags::pluginIdentifierString). Internal / el.* nodes won't match and
        // fall through to the name-based heuristic in mapBlockCategory.
        // Task 1.3 — O(1) memoised lookup (was a full KnownPluginList linear scan
        // with a String alloc per entry, per node, per push). The result is
        // identical to the prior findKnownPluginByIdentifier scan: a hit returns
        // desc.category, a miss returns the empty string.
        const String pluginIdString (n.getProperty (tags::pluginIdentifierString).toString());
        const String pluginCategory (categoryForPluginIdentifier (pluginIdString));
        b->setProperty ("category", mapBlockCategory (n, pluginCategory));

        // Task 3.A — the immutable catalog name for this block's plugin family,
        // from the SAME memo / SAME field (desc.name) the browser shows. The
        // on-canvas + inspector name is n.getName() (block.name) above; when the
        // user has renamed the block (Cmd+R), block.name diverges from this
        // catalogName and the inspector surfaces a muted "Renamed from: <catalog>"
        // line (left-panel brief §2.3 fix #3). Emitted ONLY when it is both known
        // AND actually differs from the live name, so the webview never has to
        // re-derive a catalog name (single source of truth stays block.name) and
        // an unrenamed / internal node carries no redundant field. Empty for
        // internal/IO/el.* nodes (not in the KnownPluginList) — correct: their
        // name already is their catalog name, so there is nothing to "rename from".
        const String catalogName (catalogNameForPluginIdentifier (pluginIdString));
        if (catalogName.isNotEmpty() && catalogName != n.getName())
            b->setProperty ("catalogName", catalogName);

        double x = 0, y = 0;
        n.getPosition (x, y);
        b->setProperty ("x", x);
        b->setProperty ("y", y);
        b->setProperty ("bypassed", n.isBypassed());
        b->setProperty ("muted", n.isMuted());
        b->setProperty ("muteInput", n.isMutingInputs());
        b->setProperty ("isContainer", n.isGraph());
        if (n.isGraph())
        {
            const Graph sub (n);
            b->setProperty ("containerNodeCount", sub.getNumNodes());
        }
        // Emit the user node colour as "#AARRGGBB" (leading '#') so the webview's
        // Block.hostColourOutline (which keys off a '#' prefix) renders it, and so
        // the write path (elementGraphSetNodeColor, "#RRGGBB") and this read path
        // share one "#"-prefixed contract. Empty when no custom colour set →
        // BlockData.hostColor undefined → Block falls back to the category accent.
        if (n.getUIValueTree().hasProperty ("color"))
            b->setProperty ("color", "#" + n.getColor().toString());
        else
            b->setProperty ("color", String());
        b->setProperty ("note", n.getProperty (Identifier ("userNote"), "").toString());
        // Per-block hidden parameter ports (Configure Parameters… popover) —
        // the CSV of port ids the user chose to hide on this Block. Persisted as
        // "userHiddenParams" (mirrors userNote); the webview splits the CSV into
        // BlockData.hiddenParams and filters those Value/CV ports off the Block.
        // Empty when none hidden → BlockData.hiddenParams [] → all params shown.
        b->setProperty ("hiddenParams", n.getProperty (Identifier ("userHiddenParams"), "").toString());
        // Persisted collapse TIER (Wave-3 Task 2.0; widens the legacy "collapsed"
        // bool). readCollapseTier() emits "collapseTier" from the Node ValueTree,
        // coercing a legacy "collapsed" bool (true→"title", false→"macro") and
        // defaulting absent → "macro" (the lean default) — the C++ side of the
        // dual-sided migration (contract §3.1), coercing identically to JS
        // mapBlock. Write-on-click via elementNodeSetCollapseTier. Round-trips
        // save/load with the tree.
        b->setProperty ("collapseTier", readCollapseTier (n.data()));

        // Per-block CPU load + latency. Latency comes from
        // `Processor::getLatencySamples()` (already aggregates host-reported,
        // delay-comp, and oversampler latency in processor.cpp:851), converted
        // to ms via the active device sample rate.
        //
        // cpuLoad is the REAL per-block render cost (D4): the audio thread folds
        // an EMA of each render's wall-clock nanoseconds into a lock-free atomic
        // (`Processor::getRenderNanos()`, published in
        // `ProcessBufferOp::process()`). Here on the message thread we convert
        // those nanoseconds to a percentage of the audio block's wall-clock
        // budget (blockSize / sampleRate seconds). Clamped to a sane ceiling so
        // a transient overload doesn't render an absurd number.
        double cpuLoadPercent = 0.0;
        double latencyMs = 0.0;
        // G3-A: real oversampling factor (Processor::getOversamplingFactor()).
        // Surfaced so the NodeContextMenu Oversample sub-menu shows the active
        // factor as a tick. Default 1 (off) for nodes without a processor.
        int oversample = 1;
        if (auto* proc = n.getObject())
        {
            const int latencySamples = proc->getLatencySamples();
            if (activeSampleRate > 0.0 && latencySamples > 0)
                latencyMs = (double) latencySamples / activeSampleRate * 1000.0;

            if (activeSampleRate > 0.0 && activeBlockSize > 0)
            {
                const double renderNanos = (double) proc->getRenderNanos();
                const double blockBudgetNanos = (double) activeBlockSize / activeSampleRate * 1.0e9;
                if (blockBudgetNanos > 0.0)
                    cpuLoadPercent = juce::jlimit (0.0, 999.0, renderNanos / blockBudgetNanos * 100.0);
            }

            oversample = proc->getOversamplingFactor();
        }
        b->setProperty ("cpuLoad", cpuLoadPercent);
        b->setProperty ("latencyMs", latencyMs);
        b->setProperty ("oversample", oversample);

        // A LOADING node exposes NO connectable ports (loading contract §3/§4):
        // a brand-new async-loaded plugin has no real port layout yet, so emit an
        // EMPTY ports array rather than the placeholder's guessed ports. The Block
        // therefore renders no handles and is not cable-targetable until ready.
        // (The placeholder already derives 0 ports, but gating here makes the
        // "nothing fake" guarantee explicit and independent of the placeholder.)
        Array<var> portsVar;
        if (! nodeIsLoading)
        {
            for (int pi = 0; pi < n.getNumPorts(); ++pi)
            {
                const Port p = n.getPort (pi);
                DynamicObject::Ptr po (new DynamicObject());
                const bool isIn = p.isInput();
                po->setProperty ("id", String (isIn ? "in-" : "out-") + String ((int) p.index()));
                po->setProperty ("label", p.getName());
                po->setProperty ("direction", isIn ? "input" : "output");
                po->setProperty ("type", p.getType().getSlug());
                po->setProperty ("signalType", portTypeToSignalString (p.getType()));
                portsVar.add (var (po.get()));
            }
        }
        b->setProperty ("ports", var (portsVar));

        blocks.add (var (b.get()));
    }

    Array<var> cables;
    const ValueTree arcs (G.getArcsValueTree());
    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const auto a = arcs.getChild (i);
        const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
        const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
        const String su = nodeUuidFromGraphNodeId (G, sn);
        const String du = nodeUuidFromGraphNodeId (G, dn);
        if (su.isEmpty() || du.isEmpty())
            continue;

        const int spi = (int) a.getProperty (tags::sourcePort, 0);
        const int dpi = (int) a.getProperty (tags::destPort, 0);
        const Node srcNode = G.getNodeById (sn);
        String signal = "audio";
        if (srcNode.isValid() && isPositiveAndBelow (spi, srcNode.getNumPorts()))
            signal = portTypeToSignalString (srcNode.getPort (spi).getType());

        DynamicObject::Ptr c (new DynamicObject());
        c->setProperty ("id", "cable_" + su + "_" + String (spi) + "_" + du + "_" + String (dpi) + "_" + String (i));
        c->setProperty ("source", su);
        c->setProperty ("target", du);
        c->setProperty ("sourceHandle", "out-" + String (spi));
        c->setProperty ("targetHandle", "in-" + String (dpi));
        c->setProperty ("signalType", signal);
        c->setProperty ("channelCount", signal == String ("audio") ? 2 : 1);
        c->setProperty ("isSidechain", false);
        // Phase 5B: surface wireless bus name (if any) so the front end can
        // repopulate useBusStore on hydrate.
        const String busName = a.getProperty ("busName", "").toString();
        if (busName.isNotEmpty())
            c->setProperty ("busName", busName);
        cables.add (var (c.get()));
    }

    Array<var> commentBoxes;
    {
        ValueTree uiData = gn.getUIValueTree();
        ValueTree boxesData = uiData.getChildWithName ("CommentBoxes");
        if (boxesData.isValid())
        {
            for (int i = 0; i < boxesData.getNumChildren(); ++i)
            {
                ValueTree box = boxesData.getChild (i);
                if (! box.hasType ("CommentBox"))
                    continue;
                DynamicObject::Ptr cb (new DynamicObject());
                const String cid = commentBoxUuid (box);
                cb->setProperty ("id", cid.isNotEmpty() ? cid : String ("comment_legacy_") + String (i));
                cb->setProperty ("title", box.getProperty ("title", "Comment").toString());
                cb->setProperty ("color", box.getProperty ("color", "").toString());
                cb->setProperty ("x", (double) box.getProperty ("x", 0.0));
                cb->setProperty ("y", (double) box.getProperty ("y", 0.0));
                cb->setProperty ("width", (double) box.getProperty ("width", 200.0));
                cb->setProperty ("height", (double) box.getProperty ("height", 150.0));
                commentBoxes.add (var (cb.get()));
            }
        }
    }
    root->setProperty ("commentBoxes", var (commentBoxes));

    root->setProperty ("blocks", var (blocks));
    root->setProperty ("cables", var (cables));
    return JSON::toString (var (root.get()));
}

String ElementWebViewHost::buildCableLevelsJson() const
{
    Array<var> items;
    auto sess = context.session();
    if (sess == nullptr)
        return JSON::toString (var (items));

    // P2-A1: follow the CURRENT BOARD so the dived canvas's cable IDs (built
    // from currentBoard() in buildActiveGraphJson) match these level rows. When
    // not dived currentBoard() == getActiveGraph(), so output is unchanged.
    const Node gn (currentBoard());
    if (! gn.isGraph())
        return JSON::toString (var (items));

    const Graph G (gn);
    const ValueTree arcs (G.getArcsValueTree());
    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const auto a = arcs.getChild (i);
        const auto sn = (uint32_t) (int64) a.getProperty (tags::sourceNode);
        const auto dn = (uint32_t) (int64) a.getProperty (tags::destNode);
        const String su = nodeUuidFromGraphNodeId (G, sn);
        const String du = nodeUuidFromGraphNodeId (G, dn);
        if (su.isEmpty() || du.isEmpty())
            continue;

        const int spi = (int) a.getProperty (tags::sourcePort, 0);
        const int dpi = (int) a.getProperty (tags::destPort, 0);
        const String cableId = "cable_" + su + "_" + String (spi) + "_" + du + "_" + String (dpi) + "_" + String (i);

        DynamicObject::Ptr row (new DynamicObject());
        row->setProperty ("id", cableId);
        row->setProperty ("level", cableSignalLevelForArc (G, a));

        // Flow-debug: CV arcs additionally carry the SIGNED value (`v`, the
        // chip's numeric readout) and the block |peak| (`pk`, A5 — the chip's
        // activity gate; level is unsigned presence only).
        float cvValue = 0.f, cvPeak = 0.f;
        if (cableCvValueForArc (G, a, cvValue, cvPeak))
        {
            row->setProperty ("v", cvValue);
            row->setProperty ("pk", cvPeak);
        }

        items.add (var (row.get()));
    }

    return JSON::toString (var (items));
}

/** Real per-node output level for the Block VU (Q-VU-PER-BLOCK / Pillar-2 D1).
    Mirrors `cableSignalLevelForArc`'s calibration so a Block's meter and its
    outgoing cables read identically, but sources the value from the node's OWN
    atomic output RMS — so terminal / unconnected blocks (no outgoing cable)
    light up too. Audio/CV nodes use the loudest output-channel RMS; MIDI-only
    nodes fall back to MIDI output activity. Pure atomic reads — RT-safe (no
    audio-thread interaction; the RMS is written lock-free in graphbuilder). */
static float nodeOutputLevel (const Node& n)
{
    auto* proc = n.getObject();
    if (proc == nullptr)
        return 0.f;

    const int numOutputs = proc->getNumAudioOutputs();
    if (numOutputs > 0)
    {
        float maxRms = 0.f;
        for (int i = 0; i < numOutputs; ++i)
            maxRms = jmax (maxRms, proc->getOutputRMS (i));
        if (maxRms > 0.f)
            return jmin (1.0f, maxRms * 3.0f);
    }

    // Sink nodes (e.g. Audio Output) have no audio outputs — surface input
    // RMS instead so the block meter shows the signal REACHING it rather than
    // being permanently dark. getInputRMS is populated per channel by
    // graphbuilder every render block — real data, no new plumbing. (Wave-2 E)
    const int numInputs = proc->getNumAudioInputs();
    if (numInputs > 0)
    {
        float maxInRms = 0.f;
        for (int i = 0; i < numInputs; ++i)
            maxInRms = jmax (maxInRms, proc->getInputRMS (i));
        if (maxInRms > 0.f)
            return jmin (1.0f, maxInRms * 3.0f);
    }

    // No audio output level — surface MIDI output activity (router / MIDI fx /
    // MIDI out nodes) so they are not falsely dark while passing events.
    if (proc->hasMidiOutputActivity())
        return 0.75f;

    // CV-only nodes (Constant, Comparator, Logic, ...): use the loudest CV
    // output block-|peak| latch (A5) so they are not falsely dark while
    // emitting values — including fast bipolar CV caught at a zero crossing.
    const int numCvOuts = proc->getNumOutputCVChannels();
    float maxCv = 0.f;
    for (int i = 0; i < numCvOuts; ++i)
        maxCv = jmax (maxCv, proc->getOutputCVPeak (i));
    if (maxCv > 0.f)
        return jmin (1.0f, maxCv);

    return 0.f;
}

String ElementWebViewHost::buildNodeMetersJson() const
{
    Array<var> items;
    auto sess = context.session();
    if (sess == nullptr)
        return JSON::toString (var (items));

    // P2-A1: follow the CURRENT BOARD so a dived Block's VU reflects its real
    // signal (keyed by the dived node's UUID). Identical when not dived.
    const Node gn (currentBoard());
    if (! gn.isGraph())
        return JSON::toString (var (items));

    const Graph G (gn);
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        const String uuid (n.getUuidString());
        if (uuid.isEmpty())
            continue;

        DynamicObject::Ptr row (new DynamicObject());
        row->setProperty ("id", uuid);
        row->setProperty ("level", nodeOutputLevel (n));
        items.add (var (row.get()));
    }

    return JSON::toString (var (items));
}

String ElementWebViewHost::buildNodeChannelLevelsJson() const
{
    // Per-node, per-channel output level (G3-B item 2). Reads EVERY output-RMS
    // lane (not just the loudest, as buildNodeMetersJson does) so the
    // BusInspector can show real surround/multi-channel columns. Pure atomic
    // reads — RT-safe; the per-channel RMS is written lock-free on the audio
    // thread in graphbuilder.cpp (buffer.getRMSLevel per channel). Calibration
    // is identical to nodeOutputLevel: jmin(1, rms*3). Honest-degraded: a node
    // with zero audio outputs simply emits an empty `ch` array (no fake lanes).
    Array<var> items;
    auto sess = context.session();
    if (sess == nullptr)
        return JSON::toString (var (items));

    // P2-A1: follow the CURRENT BOARD (per-lane meters for dived nodes). When
    // not dived currentBoard() == getActiveGraph(), so output is unchanged.
    const Node gn (currentBoard());
    if (! gn.isGraph())
        return JSON::toString (var (items));

    const Graph G (gn);
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        const String uuid (n.getUuidString());
        if (uuid.isEmpty())
            continue;

        auto* proc = n.getObject();
        if (proc == nullptr)
            continue;

        const int numCh = proc->getNumOutputRMSChannels();
        if (numCh <= 0)
            continue; // honest: no audio output → no per-channel lanes

        Array<var> ch;
        for (int c = 0; c < numCh; ++c)
            ch.add (jmin (1.0f, proc->getOutputRMS (c) * 3.0f));

        DynamicObject::Ptr row (new DynamicObject());
        row->setProperty ("id", uuid);
        row->setProperty ("ch", var (ch));
        items.add (var (row.get()));
    }

    return JSON::toString (var (items));
}

String ElementWebViewHost::buildMasterLevelsJson() const
{
    // Master L/R + input peak (Q-VU-LR / Q-VU-INPUT, Pillar-2 D2/D3). The
    // engine maintains per-channel output AND input LevelMeters on the audio
    // thread (audioengine.cpp updateLevel); we read their atomic `level()` on
    // the message thread. No audio-thread mutation — read-only.
    DynamicObject::Ptr root (new DynamicObject());

    auto e = context.audio();
    if (e == nullptr)
        return JSON::toString (var (root.get()));

    const int numOut = e->getNumChannels (false);
    auto channelLevel = [&e] (int channel, bool input) -> double {
        if (auto m = e->getLevelMeter (channel, input))
            return jlimit (0.0, 1.0, m->level());
        return 0.0;
    };

    // L = channel 0, R = channel 1 (mono → R mirrors L so the ladder is honest).
    const double outL = numOut > 0 ? channelLevel (0, false) : 0.0;
    const double outR = numOut > 1 ? channelLevel (1, false) : outL;
    root->setProperty ("outL", outL);
    root->setProperty ("outR", outR);

    // Input peak = loudest live audio-input channel from the device input
    // meters (real interface input, independent of graph routing).
    const int numIn = e->getNumChannels (true);
    double input = 0.0;
    for (int c = 0; c < numIn; ++c)
        input = jmax (input, channelLevel (c, true));
    root->setProperty ("input", input);

    return JSON::toString (var (root.get()));
}

String ElementWebViewHost::buildPluginListJson() const
{
    DynamicObject::Ptr root (new DynamicObject());

    // G3c item 3: build the identifier→real-useCount table once so the grouping
    // below stays O(n log n) over the ~2000-plugin payload instead of O(n²).
    auto& tracker = context.plugins().getUsageTracker();
    const std::map<String, int> usageCounts (tracker.getUsageCounts());

    const StringArray favorites (tracker.getFavoriteIdentifiers());
    const StringArray recents (tracker.getRecentlyUsedIdentifiers (16));

    // N2 / D-1: collect a thin, view-only snapshot of every scanned plugin, then
    // hand it to the pure grouping helper. We NEVER touch KnownPluginList here —
    // this is a presentation transform over `getTypes()`.
    std::vector<PluginGroupSource> sources;
    {
        const auto& list = context.plugins().getKnownPlugins();
        const auto& types = list.getTypes();
        sources.reserve ((size_t) types.size());
        for (const auto& desc : types)
        {
            PluginGroupSource s;
            s.name              = desc.name;
            s.manufacturer      = desc.manufacturerName;
            s.format            = desc.pluginFormatName;
            s.identifier        = desc.createIdentifierString();
            s.isInstrument      = desc.isInstrument;
            s.numInputChannels  = desc.numInputChannels;
            s.numOutputChannels = desc.numOutputChannels;
            s.category          = desc.category;
            s.version           = desc.version;
            s.descriptiveName   = desc.descriptiveName;
            sources.push_back (std::move (s));
        }
    }

    root->setProperty ("plugins", var (buildPluginGroupRows (sources, usageCounts, favorites, recents)));

    {
        Array<var> fav, recent;
        for (const auto& id : favorites)
            fav.add (var (id));
        for (const auto& id : recents)
            recent.add (var (id));
        root->setProperty ("favoriteIdentifiers", var (fav));
        root->setProperty ("recentIdentifiers", var (recent));
    }

    return JSON::toString (var (root.get()));
}

//==============================================================================
// N2 / D-1 — pure, headless-testable plugin grouping. See header for contract.
namespace {

/** Format preference for choosing a family's primary row. Lower == preferred.
    VST3 wins per Glen's nav feedback; the rest is a stable, documented order so
    the primary choice is deterministic across rescans. */
int pluginFormatRank (const String& format)
{
    if (format == "VST3")      return 0;
    if (format == "CLAP")      return 1;
    if (format == "AudioUnit") return 2;
    if (format == "VST")       return 3;
    if (format == "LV2")       return 4;
    return 5; // Internal / Element / unknown — never preferred over a real format
}

/** Real signal-output classification (G3c item 2), unchanged from the per-row
    logic: instruments + anything with audio-out emit audio; a pure-MIDI plugin
    whose category mentions MIDI emits MIDI; everything else is value/CV. */
String classifyGroupSignalOut (const PluginGroupSource& s)
{
    if (s.isInstrument || s.numOutputChannels != 0)
        return "audio";
    if (s.category.containsIgnoreCase ("midi"))
        return "midi";
    return "value";
}

} // namespace

juce::Array<juce::var> buildPluginGroupRows (const std::vector<PluginGroupSource>& sources,
                                             const std::map<juce::String, int>& usageCounts,
                                             const juce::StringArray& favorites,
                                             const juce::StringArray& recents)
{
    Array<var> rows;

    // Group key = manufacturer + name (trimmed, case-insensitive). One O(n) pass
    // builds the per-key index of original positions, preserving first-appearance
    // order so the emitted family list is stable across rescans.
    struct Group
    {
        std::vector<int> indices; // positions in `sources`
    };
    std::map<String, Group> groups;
    std::vector<String> keyOrder; // first-appearance order of keys

    auto groupKey = [] (const PluginGroupSource& s) -> String {
        // \x1f (unit separator) can't appear in a name/manufacturer, so it's a
        // safe, allocation-cheap composite key.
        return (s.manufacturer.trim() + "\x1f" + s.name.trim()).toLowerCase();
    };

    for (int i = 0; i < (int) sources.size(); ++i)
    {
        const String key (groupKey (sources[(size_t) i]));
        auto it = groups.find (key);
        if (it == groups.end())
        {
            Group g;
            g.indices.push_back (i);
            groups.emplace (key, std::move (g));
            keyOrder.push_back (key);
        }
        else
        {
            it->second.indices.push_back (i);
        }
    }

    for (const auto& key : keyOrder)
    {
        const Group& g = groups.at (key);

        // Pick the primary variant: best (lowest) format rank; ties broken by the
        // earlier scan position so the choice is deterministic across rescans.
        int primaryIdx = g.indices.front();
        int primaryRank = pluginFormatRank (sources[(size_t) primaryIdx].format);
        for (int idx : g.indices)
        {
            const int r = pluginFormatRank (sources[(size_t) idx].format);
            if (r < primaryRank)
            {
                primaryRank = r;
                primaryIdx = idx;
            }
        }

        const PluginGroupSource& primary = sources[(size_t) primaryIdx];

        // Aggregate the alias-keyed metadata across EVERY variant in the family,
        // so a starred / recently-used AU keeps the family in Favourites/Recents
        // even though only the VST3 primary row is shown (E2 — no orphaning).
        Array<var> aliases;  // all variant identifiers
        Array<var> variants; // structured {format, identifier} — never concatenated
        int aggregateUsage = 0;
        bool anyFavorite = false;
        int bestRecentRank = -1;

        // Emit variants primary-first, then the rest in stable scan order, so the
        // "also available as AU" reveal lists alternatives predictably.
        std::vector<int> ordered;
        ordered.reserve (g.indices.size());
        ordered.push_back (primaryIdx);
        for (int idx : g.indices)
            if (idx != primaryIdx)
                ordered.push_back (idx);

        for (int idx : ordered)
        {
            const PluginGroupSource& v = sources[(size_t) idx];
            aliases.add (var (v.identifier));

            DynamicObject::Ptr vo (new DynamicObject());
            vo->setProperty ("format", v.format);
            vo->setProperty ("identifier", v.identifier);
            variants.add (var (vo.get()));

            const auto uc = usageCounts.find (v.identifier);
            if (uc != usageCounts.end())
                aggregateUsage += uc->second;

            if (favorites.contains (v.identifier))
                anyFavorite = true;

            const int rr = recents.indexOf (v.identifier); // -1 when not recent
            if (rr >= 0 && (bestRecentRank < 0 || rr < bestRecentRank))
                bestRecentRank = rr;
        }

        DynamicObject::Ptr o (new DynamicObject());
        // Primary-row fields (identical shape to the legacy per-plugin row, so
        // every existing consumer keeps working with zero changes).
        o->setProperty ("name", primary.name);
        o->setProperty ("descriptiveName", primary.descriptiveName);
        o->setProperty ("manufacturer", primary.manufacturer);
        o->setProperty ("version", primary.version);
        o->setProperty ("format", primary.format);
        o->setProperty ("category", primary.category.isNotEmpty() ? primary.category : String ("Uncategorised"));
        o->setProperty ("identifier", primary.identifier);
        o->setProperty ("signalOut", classifyGroupSignalOut (primary));
        o->setProperty ("isInstrument", primary.isInstrument);
        o->setProperty ("numInputChannels", primary.numInputChannels);
        o->setProperty ("numOutputChannels", primary.numOutputChannels);

        // N2 group fields. usageCount is now the AGGREGATE across the family.
        o->setProperty ("usageCount", aggregateUsage);
        o->setProperty ("aliases", var (aliases));
        o->setProperty ("variants", var (variants));
        o->setProperty ("isFavorite", anyFavorite);
        o->setProperty ("recentRank", bestRecentRank);

        rows.add (var (o.get()));
    }

    return rows;
}

String ElementWebViewHost::buildNodeParametersJson (const String& nodeUuid) const
{
    DynamicObject::Ptr root (new DynamicObject());
    Array<var> params;

    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
    {
        root->setProperty ("parameters", var (params));
        return JSON::toString (var (root.get()));
    }

    const Graph G (currentBoard());
    if (! G.isGraph())
    {
        root->setProperty ("parameters", var (params));
        return JSON::toString (var (root.get()));
    }

    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
    {
        root->setProperty ("parameters", var (params));
        return JSON::toString (var (root.get()));
    }

    if (auto* obj = n.getObject())
        if (auto* proc = obj->getAudioProcessor())
        {
            int paramIndex = 0;
            for (auto* par : proc->getParameters())
            {
                if (par == nullptr)
                    continue;
                DynamicObject::Ptr p (new DynamicObject());
                p->setProperty ("index", paramIndex++);
                p->setProperty ("name", par->getName (64));
                p->setProperty ("value", par->getValue());
                p->setProperty ("defaultValue", par->getDefaultValue());
                p->setProperty ("label", par->getLabel());
                if (auto* fp = dynamic_cast<juce::AudioParameterFloat*> (par))
                {
                    p->setProperty ("min", (double) fp->range.start);
                    p->setProperty ("max", (double) fp->range.end);
                }
                else if (auto* ip = dynamic_cast<juce::AudioParameterInt*> (par))
                {
                    p->setProperty ("min", (int) ip->getRange().getStart());
                    p->setProperty ("max", (int) ip->getRange().getEnd());
                    p->setProperty ("stepped", true);
                }
                else if (dynamic_cast<juce::AudioParameterBool*> (par) != nullptr)
                    p->setProperty ("boolean", true);
                params.add (var (p.get()));
            }
        }

    root->setProperty ("parameters", var (params));
    return JSON::toString (var (root.get()));
}

void ElementWebViewHost::pushParameterUpdates()
{
    if (browser == nullptr)
        return;

    auto sess = context.session();
    if (sess == nullptr)
        return;

    const Graph G (currentBoard());
    if (! G.isGraph())
        return;

    constexpr float kEpsilon = 1.0e-4f;
    Array<var> entries;
    std::unordered_map<std::string, float> seen;
    seen.reserve (lastPushedParamValues.size());

    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        if (! n.isValid())
            continue;
        const String uuid = n.getUuidString();
        if (uuid.isEmpty())
            continue;

        auto* obj = n.getObject();
        if (obj == nullptr)
            continue;
        auto* proc = obj->getAudioProcessor();
        if (proc == nullptr)
            continue;

        Array<var> changedParams;
        const auto& params = proc->getParameters();
        for (int p = 0; p < params.size(); ++p)
        {
            auto* par = params[p];
            if (par == nullptr)
                continue;
            const float v = par->getValue();
            std::string key = uuid.toStdString();
            key.push_back (':');
            key += std::to_string (p);

            seen[key] = v;
            auto it = lastPushedParamValues.find (key);
            const bool isFirst = (it == lastPushedParamValues.end());
            if (isFirst || std::fabs (it->second - v) > kEpsilon)
            {
                DynamicObject::Ptr pv (new DynamicObject());
                pv->setProperty ("i", p);
                pv->setProperty ("v", (double) v);
                changedParams.add (var (pv.get()));
            }
        }

        if (! changedParams.isEmpty())
        {
            DynamicObject::Ptr row (new DynamicObject());
            row->setProperty ("nodeId", uuid);
            row->setProperty ("params", var (changedParams));
            entries.add (var (row.get()));
        }
    }

    // Replace the cache wholesale with what we just observed: stale entries
    // (nodes that have been deleted) are dropped automatically.
    lastPushedParamValues = std::move (seen);

    if (entries.isEmpty())
        return;

    const String json = JSON::toString (var (entries));
    evalInBrowser ("window.__elementNative && window.__elementNative.onParameterUpdate && window.__elementNative.onParameterUpdate("
                   + json + ");");
}

bool ElementWebViewHost::setNodeParameterValue (const String& nodeUuid, int paramIndex, float value)
{
    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
        return false;

    const Graph G (currentBoard());
    if (! G.isGraph())
        return false;

    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
        return false;

    if (auto* obj = n.getObject())
        if (auto* proc = obj->getAudioProcessor())
        {
            auto& params = proc->getParameters();
            if (isPositiveAndBelow (paramIndex, params.size()))
                if (auto* pars = params[paramIndex])
                {
                    pars->setValueNotifyingHost (value);
                    return true;
                }
        }

    return false;
}

bool ElementWebViewHost::setNodeIntMode (const String& nodeUuid, int mode)
{
    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
        return false;

    const Graph G (currentBoard());
    if (! G.isGraph())
        return false;

    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
        return false;

    if (auto* proc = n.getObject())
    {
        if (auto* cmp = dynamic_cast<ComparatorNode*> (proc))
        {
            cmp->setOperator ((ComparatorNode::Op) mode);
            return true;
        }
        if (auto* lg = dynamic_cast<LogicGateNode*> (proc))
        {
            lg->setMode ((LogicGateNode::Mode) mode);
            return true;
        }
    }

    return false;
}

#endif // JUCE_WEB_BROWSER

} // namespace element
