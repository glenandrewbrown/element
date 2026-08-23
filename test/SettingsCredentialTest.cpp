// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/settings.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (SettingsCredentialTests)

BOOST_AUTO_TEST_CASE (ObfuscateRoundTrips)
{
    juce::String original = "sk-test-abc123-xyz789";
    juce::String obfuscated = Settings::obfuscate (original);
    juce::String recovered = Settings::deobfuscate (obfuscated);

    BOOST_CHECK_EQUAL (recovered.toStdString(), original.toStdString());
    BOOST_CHECK (obfuscated != original);
}

BOOST_AUTO_TEST_CASE (ObfuscateEmptyString)
{
    BOOST_CHECK (Settings::obfuscate ("").isEmpty());
    BOOST_CHECK (Settings::deobfuscate ("").isEmpty());
}

BOOST_AUTO_TEST_CASE (ObfuscateHandlesSpecialChars)
{
    juce::String original = "p@$$w0rd!#%&*(){}[]";
    juce::String recovered = Settings::deobfuscate (Settings::obfuscate (original));
    BOOST_CHECK_EQUAL (recovered.toStdString(), original.toStdString());
}

BOOST_AUTO_TEST_SUITE_END()
