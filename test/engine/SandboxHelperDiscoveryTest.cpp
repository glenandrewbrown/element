// SPDX-License-Identifier: GPL-3.0-or-later
//
// Resolution-order tests for the sandbox worker helper discovery (P4 item 1,
// 2026-06-06). detail::resolveSandboxHelperExecutable is a pure function over
// SandboxHelperSearchSpec, so the order — env override → owning-bundle
// Contents/Helpers → executable-adjacent → not-found — is testable without
// spawning any process or touching the real environment.

#include <boost/test/unit_test.hpp>

#include "engine/sandboxhost.hpp"

using namespace element;

namespace {

/** Temp dir scaffold mimicking a macOS bundle layout. Deleted on destruction. */
struct ScratchDir
{
    ScratchDir()
        : root (juce::File::getSpecialLocation (juce::File::tempDirectory)
                    .getChildFile ("el-helper-discovery-test")
                    .getNonexistentSibling())
    {
        root.createDirectory();
    }

    ~ScratchDir() { root.deleteRecursively(); }

    juce::File makeFile (const juce::String& relPath) const
    {
        auto f = root.getChildFile (relPath);
        f.getParentDirectory().createDirectory();
        f.create();
        return f;
    }

    juce::File root;
};

#if JUCE_MAC
const char* kHelpersBinRel = "Contents/Helpers/Element Sandbox Host.app/Contents/MacOS/Element Sandbox Host";
#elif JUCE_WINDOWS
const char* kHelpersBinRel = "Contents/Helpers/Element Sandbox Host.exe";
#else
const char* kHelpersBinRel = "Contents/Helpers/element_sandbox_host";
#endif

} // namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxHelperDiscoveryTests)

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (env_override_wins_over_everything)
{
    ScratchDir tmp;
    const auto envHelper = tmp.makeFile ("override/custom_helper");
    const auto bundleHelper = tmp.makeFile (juce::String ("Bundle.app/") + kHelpersBinRel);

    detail::SandboxHelperSearchSpec spec;
    spec.envOverride = envHelper.getFullPathName();
    spec.bundleContentsDir = tmp.root.getChildFile ("Bundle.app/Contents");
    spec.hostExe = tmp.root.getChildFile ("nonexistent/host");

    const auto resolved = detail::resolveSandboxHelperExecutable (spec);
    BOOST_CHECK_EQUAL (resolved.getFullPathName().toStdString(),
                       envHelper.getFullPathName().toStdString());
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (missing_env_override_falls_through_to_bundle)
{
    ScratchDir tmp;
    const auto bundleHelper = tmp.makeFile (juce::String ("Bundle.app/") + kHelpersBinRel);

    detail::SandboxHelperSearchSpec spec;
    spec.envOverride = tmp.root.getChildFile ("does/not/exist").getFullPathName();
    spec.bundleContentsDir = tmp.root.getChildFile ("Bundle.app/Contents");
    spec.hostExe = tmp.root.getChildFile ("nonexistent/host");

    const auto resolved = detail::resolveSandboxHelperExecutable (spec);
    BOOST_CHECK_EQUAL (resolved.getFullPathName().toStdString(),
                       bundleHelper.getFullPathName().toStdString());
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (bundle_helpers_dir_resolves_without_env)
{
    ScratchDir tmp;
    const auto bundleHelper = tmp.makeFile (juce::String ("Plug.vst3/") + kHelpersBinRel);

    detail::SandboxHelperSearchSpec spec; // no env override
    spec.bundleContentsDir = tmp.root.getChildFile ("Plug.vst3/Contents");
    spec.hostExe = tmp.root.getChildFile ("nonexistent/host");

    const auto resolved = detail::resolveSandboxHelperExecutable (spec);
    BOOST_CHECK_EQUAL (resolved.getFullPathName().toStdString(),
                       bundleHelper.getFullPathName().toStdString());
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (nothing_found_returns_nonexistent_file)
{
    ScratchDir tmp;

    detail::SandboxHelperSearchSpec spec;
    spec.bundleContentsDir = tmp.root.getChildFile ("NoBundle.app/Contents");
    spec.hostExe = tmp.root.getChildFile ("nonexistent/host");

    const auto resolved = detail::resolveSandboxHelperExecutable (spec);
    BOOST_CHECK (! resolved.existsAsFile());
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (owning_bundle_contents_dir_walks_up_from_module)
{
    ScratchDir tmp;
    // Simulate a plugin dylib nested in a .vst3 bundle.
    const auto dylib = tmp.makeFile ("Stack/KV-Element.vst3/Contents/MacOS/KV-Element");

    const auto contents = detail::owningBundleContentsDir (dylib);
    BOOST_CHECK_EQUAL (contents.getFullPathName().toStdString(),
                       tmp.root.getChildFile ("Stack/KV-Element.vst3/Contents")
                           .getFullPathName().toStdString());

    // Flat binary (no bundle ancestor) → nonexistent result.
    const auto flat = tmp.makeFile ("flat/element_bin");
    const auto none = detail::owningBundleContentsDir (flat);
    BOOST_CHECK (none.getFullPathName().isEmpty() || ! none.exists());
}

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (current_module_file_resolves_to_real_binary)
{
    // dladdr (or GetModuleHandleEx) must locate the binary containing the
    // resolver code — for test_element that is the test executable itself.
    const auto mod = detail::currentModuleFile();
    BOOST_CHECK (mod.existsAsFile());
}

BOOST_AUTO_TEST_SUITE_END()
