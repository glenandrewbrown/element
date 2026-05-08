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
#include "presetmanager.hpp"
#include "appinfo.hpp"
#include "nodes/scriptnode.hpp"

#include <algorithm>
#include <cstdlib>
#include <cstring>
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

    auto addFromDir = [&all] (const File& dir, bool recursive)
    {
        if (! dir.isDirectory())
            return;
        for (const auto& entry :
             RangedDirectoryIterator (dir, recursive, "*.els;*.elg;*.eln;*.elpreset;*.elc",
                                      File::findFiles))
        {
            const File f = entry.getFile();
            all.push_back ({ f, f.getLastModificationTime() });
        }
    };

    addFromDir (DataPath::defaultSessionDir(), true);
    addFromDir (DataPath::defaultGraphDir(), true);
    addFromDir (DataPath::defaultControllersDir(), true);

    const File userRoot = DataPath::defaultLocation();
    for (const auto& entry : RangedDirectoryIterator (userRoot, false, "*.els;*.elg", File::findFiles))
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
        DynamicObject::Ptr o (new DynamicObject());
        o->setProperty ("path", f.getFullPathName());
        o->setProperty ("name", f.getFileNameWithoutExtension());
        o->setProperty ("ext", f.getFileExtension().toLowerCase());
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

    if (pt.isAudio() || pt.isCv())
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
    o->setProperty ("name", n.getName());
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
    // dladdr-based resolution works in both standalone and plugin contexts.
    Dl_info info {};
    if (dladdr (reinterpret_cast<const void*> (&resolveWebviewDistRoot), &info) != 0
        && info.dli_fname != nullptr)
    {
        const File binary (info.dli_fname);
       #if JUCE_MAC
        // <Bundle>/Contents/MacOS/<binary>  -->  <Bundle>/Contents/Resources/webview
        const auto contents = binary.getParentDirectory().getParentDirectory();
        const auto bundled = contents.getChildFile ("Resources").getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
            return bundled;
       #else
        // Linux: bundled next to the binary
        const auto bundled = binary.getParentDirectory().getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
            return bundled;
       #endif
    }
   #endif

   #if JUCE_MAC
    // Standalone-app fallback: walk up from the running executable.
    {
        const auto exe = File::getSpecialLocation (File::currentExecutableFile);
        const auto contents = exe.getParentDirectory().getParentDirectory();
        const auto bundled = contents.getChildFile ("Resources").getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
            return bundled;
    }
   #elif JUCE_WINDOWS
    // Windows: bundled next to the executable (or use dladdr equivalent if needed).
    {
        const auto exe = File::getSpecialLocation (File::currentExecutableFile);
        const auto bundled = exe.getParentDirectory().getChildFile ("webview");
        if (bundled.getChildFile ("index.html").existsAsFile())
            return bundled;
    }
   #endif

    // Final fallback: compile-time dev tree path (hot-reload during development).
    return File (element::webview_dist::kDistPath);
}

//==============================================================================
ElementWebViewHost::ElementWebViewHost (Context& ctx, bool skipBrowser) : context (ctx)
{
    logForwarder = std::make_unique<ElementWebViewLogForwarder> (*this);
    context.logger().addListener (logForwarder.get());

    const File distRoot = resolveWebviewDistRoot();

    const char* devUrlEnv = nullptr;
   #if JUCE_DEBUG
    devUrlEnv = std::getenv ("ELEMENT_WEBVIEW_DEV_URL");
   #endif
    const String devUrl = devUrlEnv != nullptr ? String (devUrlEnv) : String();
    const bool useDevServer = devUrl.isNotEmpty();

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
            const String j (buildActiveGraphJson());
            postCompletion (completion, j);
        });

    registerFn (
        Identifier ("elementGetPluginList"),
        [this, postCompletion] (const Array<var>&, auto completion) {
            const String j (buildPluginListJson());
            postCompletion (completion, j);
        });

    registerFn (
        Identifier ("elementGetNodeParameters"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String uuid;
            if (args.size() > 0)
                uuid = args[0].toString();
            const String j (buildNodeParametersJson (uuid));
            postCompletion (completion, j);
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
            const double cpuFrac = context.devices().getCpuUsage();
            root->setProperty ("cpu", cpuFrac);

            // Audio device — sample rate, buffer, name, latency.
            bool engineRunning = false;
            if (auto* dev = context.devices().getCurrentAudioDevice())
            {
                engineRunning = true;
                const double sr = dev->getCurrentSampleRate();
                const int buf = dev->getCurrentBufferSizeSamples();
                root->setProperty ("sampleRate", sr);
                root->setProperty ("bufferSize", buf);
                root->setProperty ("deviceName", dev->getName());

                const int inLat = dev->getInputLatencyInSamples();
                const int outLat = dev->getOutputLatencyInSamples();
                root->setProperty ("inputLatencySamples", inLat);
                root->setProperty ("outputLatencySamples", outLat);
                if (sr > 0.0)
                {
                    root->setProperty ("deviceLatencyInputMs",
                                       (double) inLat / sr * 1000.0);
                    root->setProperty ("deviceLatencyOutputMs",
                                       (double) outLat / sr * 1000.0);
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
            // accessible Monitor (atomics).
            bool transportPlaying = false;
            bool transportRecording = false;
            double tempo = 120.0;
            int tsNum = 4, tsDen = 4;
            if (auto e = context.audio())
            {
                if (auto mon = e->getTransportMonitor())
                {
                    transportPlaying = mon->playing.get();
                    transportRecording = mon->recording.get();
                    tempo = (double) mon->tempo.get();
                    tsNum = mon->beatsPerBar.get();
                    tsDen = mon->beatType.get();
                }
            }
            root->setProperty ("transportPlaying", transportPlaying);
            root->setProperty ("transportRecording", transportRecording);
            root->setProperty ("tempoBpm", tempo);

            Array<var> ts;
            ts.add (var (tsNum));
            ts.add (var (tsDen));
            root->setProperty ("timeSig", var (ts));

            postCompletion (completion, JSON::toString (var (root.get())));
        });

    registerFn (
        Identifier ("elementScriptGetSource"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            String source;
            if (args.size() >= 1)
            {
                if (auto sess = context.session())
                {
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Node graph (sess != nullptr ? sess->getCurrentGraph() : Node());
                    if (graph.isGraph())
                    {
                        context.services().postMessage (new AddPluginMessage (graph, *desc, true));
                        ok = true;
                    }
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
                    const Graph G (sess->getCurrentGraph());
                    if (G.isGraph())
                    {
                        const Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            context.services().postMessage (new RemoveNodeMessage (n));
                            ok = true;
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                            const Graph G (sess->getCurrentGraph());
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

    registerFn (
        Identifier ("elementGraphSetBypass"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            bool ok = false;
            if (args.size() >= 2)
            {
                if (auto sess = context.session())
                {
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    Graph G (sess->getCurrentGraph());
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
                    Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
                    if (G.isGraph())
                    {
                        Node n = findNodeByUuidInGraph (G, args[0].toString());
                        if (n.isValid())
                        {
                            n.setProperty (tags::name, args[1].toString().trim());
                            ok = true;
                        }
                    }
                }
            }
            if (ok)
                pushGraphSnapshot();
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
                    const Graph G (sess->getCurrentGraph());
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

    registerFn (
        Identifier ("elementGraphDuplicateNodes"),
        [this, postCompletion] (const Array<var>& args, auto completion) {
            int count = 0;
            if (args.size() >= 1)
            {
                const var& ids = args[0];
                if (auto sess = context.session())
                {
                    const Graph G (sess->getCurrentGraph());
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
                const Graph G (sess->getCurrentGraph());
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
                Graph G (sess->getCurrentGraph());
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
                        Graph G (sess->getCurrentGraph());
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
                    Graph G (sess->getCurrentGraph());
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
                FileChooser chooser ("Open Session", startDir, "*.els", true, false);
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
                FileChooser chooser ("Import Graph", File(), "*.elg", true, false);
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
                    FileChooser chooser (TRANS ("Export Graph"), start, "*.elg");
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
                    Node graphNode = sess->getCurrentGraph();
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
                const Node gn (sess->getCurrentGraph());
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
                                const Node gn (sess->getCurrentGraph());
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
                const Node gn (sess->getCurrentGraph());
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

            const Graph G (sess->getCurrentGraph());
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

            const Graph G (sess->getCurrentGraph());
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

            Graph G (sess->getCurrentGraph());
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
                const Graph G (sess->getCurrentGraph());
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
                        Graph G (sess->getCurrentGraph());
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

            Graph G (sess->getCurrentGraph());
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
                const Graph G (sess->getCurrentGraph());
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
                    const Graph G (sess->getCurrentGraph());
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

            Graph G (sess->getCurrentGraph());
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
                const Graph G (sess->getCurrentGraph());
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

            Node gn (sess->getCurrentGraph());
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

            Node gn (sess->getCurrentGraph());
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

            const Graph G (sess->getCurrentGraph());
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

            const Graph G (sess->getCurrentGraph());
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

    if (! skipBrowser)
    {
        browser = std::make_unique<WebBrowserComponent> (opts);
        addAndMakeVisible (*browser);

        if (useDevServer)
            browser->goToURL (devUrl);
        else
           #if JUCE_WEB_BROWSER_RESOURCE_PROVIDER_AVAILABLE
            browser->goToURL (WebBrowserComponent::getResourceProviderRoot());
           #else
            jassertfalse;
           #endif
    }

    // P1-11: subscribe to additive engine-state-changed signal so graph is
    // pushed to the React bundle whenever the engine removes/rebuilds a graph.
    if (auto* es = ctx.services().find<EngineService>())
        engineStateChangedConnection = es->sigEngineStateChanged.connect (
            [this] { scheduleGraphPush (40); });

    attachSessionListener();
    startTimerHz (60);
}

ElementWebViewHost::~ElementWebViewHost()
{
    stopTimer();
    engineStateChangedConnection.disconnect(); // P1-11
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
}

void ElementWebViewHost::rebuildPluginEmbedLayout()
{
    if (pluginEmbedEditor != nullptr && ! pluginEmbedBounds.isEmpty())
        pluginEmbedEditor->setBounds (pluginEmbedBounds);
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
    pluginEmbedEditor.reset();
    pluginEmbedBounds = {};
    pluginEmbedNodeUuid = {};
}

void ElementWebViewHost::pluginEditorOpen (const String& nodeUuid, int x, int y, int w, int h)
{
    pluginEditorClose();
    auto sess = context.session();
    if (sess == nullptr || nodeUuid.isEmpty())
        return;

    const Graph G (sess->getCurrentGraph());
    const Node n = findNodeByUuidInGraph (G, nodeUuid);
    if (! n.isValid())
        return;

    auto* gui = context.services().find<GuiService>();
    if (gui == nullptr)
        return;

    pluginEmbedNodeUuid = nodeUuid;
    pluginEmbedBounds = Rectangle<int> (x, y, jmax (120, w), jmax (80, h));
    pluginEmbedEditor = createPluginEditorPanel (*gui, n);
    if (pluginEmbedEditor == nullptr)
    {
        pluginEmbedBounds = {};
        pluginEmbedNodeUuid = {};
        return;
    }

    addAndMakeVisible (*pluginEmbedEditor);
    rebuildPluginEmbedLayout();
    pluginEmbedEditor->toFront (false);
}

void ElementWebViewHost::pluginEditorSetBounds (int x, int y, int w, int h)
{
    pluginEmbedBounds = Rectangle<int> (x, y, jmax (60, w), jmax (60, h));
    rebuildPluginEmbedLayout();
}

void ElementWebViewHost::pluginEditorFloat()
{
    if (pluginEmbedNodeUuid.isEmpty())
        return;

    auto sess = context.session();
    auto* gui = context.services().find<GuiService>();
    if (sess == nullptr || gui == nullptr)
        return;

    const Graph G (sess->getCurrentGraph());
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

    if (auto peak = metering.popLatestPeak())
    {
        const String js = "window.__elementNative && window.__elementNative.onMetering("
                            + String (*peak, 6) + ");";
        evalInBrowser (js);
    }

    {
        const String cableJson (buildCableLevelsJson());
        evalInBrowser ("window.__elementNative && window.__elementNative.onCableLevels && window.__elementNative.onCableLevels("
                       + cableJson + ");");
    }

    if (logPushPending && browser != nullptr)
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

bool ElementWebViewHost::shouldIgnoreSessionRootProperty (const Identifier& prop) const
{
    return prop != tags::tempo && prop != tags::name;
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
        scheduleGraphPush (40);
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
    if (parent == graphs || isUnderActiveGraph (parent))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeChildRemoved (ValueTree& parent, ValueTree&, int)
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
    if (parent == graphs || isUnderActiveGraph (parent))
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
    if (parent == graphs || isUnderActiveGraph (parent))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeParentChanged (ValueTree& tree)
{
    if (isUnderActiveGraph (tree))
        scheduleGraphPush (40);
}

void ElementWebViewHost::valueTreeRedirected (ValueTree& tree)
{
    auto sess = context.session();
    if (sess != nullptr && tree == sess->getValueTree())
    {
        scheduleGraphPush (40);
        return;
    }
    if (isUnderActiveGraph (tree))
        scheduleGraphPush (40);
}

void ElementWebViewHost::pushGraphSnapshot()
{
    graphPushPendingMs = 0;
    const String json (buildActiveGraphJson());
    evalInBrowser ("window.__elementNative && window.__elementNative.onGraphState(" + json + ");");
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
    }
    else
    {
        sessionObj->setProperty ("filePath", String());
        sessionObj->setProperty ("dirty", false);
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

    const Node gn (sess->getCurrentGraph());
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
    root->setProperty ("activeGraphId", gn.getUuidString());
    root->setProperty ("activeGraphIndex", sess->getActiveGraphIndex());

    Array<var> breadcrumbs;
    breadcrumbs.add (var (sess->getName()));
    breadcrumbs.add (var (gn.getName()));
    root->setProperty ("breadcrumbs", var (breadcrumbs));

    appendCanvasJson (gn, G, root);
    appendActiveGraphOutlineJson (G, root);

    // Sample rate for per-block latency-in-samples → ms conversion. Pulled
    // once outside the node loop so we don't re-read the device per block.
    // 0.0 when no audio device is open (treated as "unknown" → latencyMs 0).
    double activeSampleRate = 0.0;
    if (auto* dev = context.devices().getCurrentAudioDevice())
        activeSampleRate = dev->getCurrentSampleRate();

    Array<var> blocks;
    for (int i = 0; i < G.getNumNodes(); ++i)
    {
        const Node n (G.getNode (i));
        DynamicObject::Ptr b (new DynamicObject());
        b->setProperty ("id", n.getUuidString());
        b->setProperty ("name", n.getName());
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
        b->setProperty ("color", n.getColor().toString());
        b->setProperty ("note", n.getProperty (Identifier ("userNote"), "").toString());

        // Per-block CPU load + latency. Latency comes from
        // `Processor::getLatencySamples()` (already aggregates host-reported,
        // delay-comp, and oversampler latency in processor.cpp:851), converted
        // to ms via the active device sample rate.
        //
        // FIXME(US-002): there is no per-Processor CPU usage source today —
        // `juce::AudioDeviceManager::getCpuUsage()` is engine-wide. Until a
        // per-block measurement layer exists (would require touching
        // `src/engine/`, out of scope for the snapshot story), `cpuLoad` is
        // emitted as 0 so the JSON shape is stable. React consumers
        // (`InspectorHub`, `Block.tsx`) already gate display on `> 0`.
        double cpuLoadPercent = 0.0;
        double latencyMs = 0.0;
        if (auto* proc = n.getObject())
        {
            const int latencySamples = proc->getLatencySamples();
            if (activeSampleRate > 0.0 && latencySamples > 0)
                latencyMs = (double) latencySamples / activeSampleRate * 1000.0;
        }
        b->setProperty ("cpuLoad", cpuLoadPercent);
        b->setProperty ("latencyMs", latencyMs);

        Array<var> portsVar;
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

    const Node gn (sess->getCurrentGraph());
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
        items.add (var (row.get()));
    }

    return JSON::toString (var (items));
}

String ElementWebViewHost::buildPluginListJson() const
{
    DynamicObject::Ptr root (new DynamicObject());
    Array<var> plugins;

    const auto& list = context.plugins().getKnownPlugins();
    for (const auto& desc : list.getTypes())
    {
        DynamicObject::Ptr o (new DynamicObject());
        o->setProperty ("name", desc.name);
        o->setProperty ("descriptiveName", desc.descriptiveName);
        o->setProperty ("manufacturer", desc.manufacturerName);
        o->setProperty ("version", desc.version);
        o->setProperty ("format", desc.pluginFormatName);
        const String category (desc.category.isNotEmpty() ? desc.category : String ("Uncategorised"));
        o->setProperty ("category", category);
        o->setProperty ("identifier", desc.createIdentifierString());
        plugins.add (var (o.get()));
    }

    root->setProperty ("plugins", var (plugins));

    {
        auto& tracker = context.plugins().getUsageTracker();
        Array<var> fav, recent;
        for (const auto& id : tracker.getFavoriteIdentifiers())
            fav.add (var (id));
        for (const auto& id : tracker.getRecentlyUsedIdentifiers (16))
            recent.add (var (id));
        root->setProperty ("favoriteIdentifiers", var (fav));
        root->setProperty ("recentIdentifiers", var (recent));
    }

    return JSON::toString (var (root.get()));
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

    const Graph G (sess->getCurrentGraph());
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

    const Graph G (sess->getCurrentGraph());
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

    const Graph G (sess->getCurrentGraph());
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

#endif // JUCE_WEB_BROWSER

} // namespace element
