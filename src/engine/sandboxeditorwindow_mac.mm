// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// macOS activation-policy hooks for the sandbox WORKER process.
//
// The worker is a re-exec of the SAME Element Mach-O under the SAME
// CFBundleIdentifier (net.kushview.Element). It boots through
// START_JUCE_APPLICATION -> NSApplicationMain as a GUI app. If it ever
// registers as a *foreground* (Regular) activation-policy app, macOS sees two
// foreground instances of net.kushview.Element — the host (or the installed
// /Applications/Element.app, same id) and the worker — and the OS's
// duplicate-instance enforcement SIGKILLs an net.kushview.Element process. The
// host then dies even though the *worker* is the duplicate. (Confirmed by the
// 3-case natural experiment: distinct-id workers — test_element, rspike —
// survive; the shared-id dev worker takes the host down.)
//
// Fix: pin the worker to NSApplicationActivationPolicyProhibited as early as
// possible (it does no foreground UI of its own — heartbeats + audio only), so
// it never registers as a duplicate foreground instance. When the user opens a
// plugin editor we promote only as far as Accessory: an Accessory app shows +
// focuses real NSWindows (the editor) WITHOUT becoming a Dock/Cmd-Tab
// foreground app, so it does not re-trigger the duplicate-foreground-app kill.
// (Regular is what triggered it.)

#import <AppKit/AppKit.h>

namespace element {

void sandboxWorkerSetAccessoryPolicy()
{
    if (NSApp == nil)
        return;

    // Prohibited: the worker is a pure background helper (no foreground UI of its
    // own) and must NOT register as a foreground instance of net.kushview.Element,
    // or macOS duplicate-instance enforcement SIGKILLs an net.kushview.Element
    // process and takes the host down. Safe to call repeatedly.
    if ([NSApp activationPolicy] != NSApplicationActivationPolicyProhibited)
        [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];
}

void sandboxWorkerActivateForEditor()
{
    if (NSApp == nil)
        return;

    // Promote to Accessory (NOT Regular) so the editor window is a focusable,
    // composited NSWindow that can take key focus, while the worker stays a
    // non-foreground helper. Regular here makes the worker a second foreground
    // net.kushview.Element instance and trips the duplicate-instance SIGKILL
    // that kills the host. Accessory shows+focuses windows without that. Safe to
    // call repeatedly.
    if ([NSApp activationPolicy] != NSApplicationActivationPolicyAccessory)
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];

    [NSApp activateIgnoringOtherApps:YES];
}

} // namespace element
