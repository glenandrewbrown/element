// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// macOS activation hook for the worker-side separate-window plugin editor.
// The sandbox worker is normally dock-hidden (accessory) so its background
// audio process doesn't clutter the Dock / Cmd-Tab. When it opens a plugin
// editor window the user actually interacts with, the process must become a
// regular activation-policy app and come to the front so the window is visible
// and can take key focus. See sandboxeditorwindow.hpp / .cpp.

#import <AppKit/AppKit.h>

namespace element {

void sandboxWorkerActivateForEditor()
{
    if (NSApp == nil)
        return;

    // Promote from accessory (dock-hidden) to regular so the editor window is a
    // first-class, focusable, composited window. Safe to call repeatedly.
    if ([NSApp activationPolicy] != NSApplicationActivationPolicyRegular)
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];

    [NSApp activateIgnoringOtherApps:YES];
}

} // namespace element
