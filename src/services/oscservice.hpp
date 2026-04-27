// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/services.hpp>

namespace element {

class OSCService : public Service
{
public:
    OSCService();
    ~OSCService();

    /** Sets the port and starts/stops the host accoding to Settings

        @param alertOnFail  If true, show an alert if the host could not start
    */
    void refreshWithSettings (bool alertOnFail = false);

    /** Connect the OSC sender to a remote host.
        @returns true on success, false if the connection failed.
    */
    bool connectSender (const juce::String& host, int port);

    /** Disconnect the OSC sender. */
    void disconnectSender();

    /** Returns true if the sender is currently connected. */
    bool isSenderConnected() const noexcept;

    /** Send an OSC message.
        @returns false if not connected or if the send fails; never throws.
    */
    bool sendMessage (const juce::OSCMessage& msg);

    void activate() override;
    void deactivate() override;

private:
    class Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace element
