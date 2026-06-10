#!/bin/zsh
# Build, sign (Developer ID), notarize, and package a release zip.
#
# One-time setup:
#   1. Join the Apple Developer Program (developer.apple.com, $99/yr).
#   2. Find your Team ID: developer.apple.com/account -> Membership details.
#   3. Create an app-specific password at account.apple.com -> Sign-In and
#      Security -> App-Specific Passwords, then store it for notarytool:
#        xcrun notarytool store-credentials auto-gdpr-notary \
#          --apple-id you@example.com --team-id TEAMID --password <app-pw>
#   4. Create the signing certificate (needs the Xcode UI once): Xcode ->
#      Settings -> Accounts -> select your team -> Manage Certificates ->
#      "+" -> "Developer ID Application".
#
# Usage:
#   TEAM_ID=XXXXXXXXXX ./scripts/release.sh 1.0
#
# Prints the zip path and its sha256 (for the Homebrew cask) on success.

set -euo pipefail

VERSION=${1:?usage: release.sh <version>}
: "${TEAM_ID:?Set TEAM_ID to your Apple Developer Team ID}"
NOTARY_PROFILE=${NOTARY_PROFILE:-auto-gdpr-notary}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/Auto GDPR Reject/Auto GDPR Reject.xcodeproj"
DIST="$ROOT/dist"
ARCHIVE="$DIST/AutoGDPRReject.xcarchive"
EXPORT="$DIST/export"
APP="$EXPORT/Auto GDPR Reject.app"
ZIP="$DIST/Auto-GDPR-Reject-$VERSION.zip"

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}

rm -rf "$DIST"
mkdir -p "$DIST"

echo "==> Archiving (Release, team $TEAM_ID)"
xcodebuild archive \
    -project "$PROJECT" \
    -scheme "Auto GDPR Reject" \
    -configuration Release \
    -archivePath "$ARCHIVE" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    MARKETING_VERSION="$VERSION" \
    | tail -2

echo "==> Exporting with Developer ID signing"
cat > "$DIST/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>teamID</key>
    <string>$TEAM_ID</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>signingCertificate</key>
    <string>Developer ID Application</string>
</dict>
</plist>
EOF
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportOptionsPlist "$DIST/ExportOptions.plist" \
    -exportPath "$EXPORT" \
    -allowProvisioningUpdates \
    | tail -2

echo "==> Notarizing (profile: $NOTARY_PROFILE)"
ditto -c -k --keepParent "$APP" "$ZIP"
xcrun notarytool submit "$ZIP" --keychain-profile "$NOTARY_PROFILE" --wait

echo "==> Stapling ticket and re-zipping"
xcrun stapler staple "$APP"
rm "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"

echo ""
echo "==> Done: $ZIP"
echo "    Upload it to a GitHub release tagged v$VERSION, then put this"
echo "    sha256 in the Homebrew cask:"
shasum -a 256 "$ZIP"
