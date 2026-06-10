# Homebrew cask for Auto GDPR Reject.
#
# This file lives in your tap repository — a GitHub repo named
# "homebrew-tap" under your account, at the path:
#   Casks/auto-gdpr-reject.rb
#
# After each release: update `version`, paste the sha256 printed by
# scripts/release.sh, and push. Users then install with:
#   brew tap chadwishner/tap
#   brew install --cask auto-gdpr-reject

cask "auto-gdpr-reject" do
  version "1.0"
  sha256 "REPLACE_WITH_SHA256_FROM_RELEASE_SCRIPT"

  url "https://github.com/chadwishner/AutoGDPRRejectExtension/releases/download/v#{version}/Auto-GDPR-Reject-#{version}.zip"
  name "Auto GDPR Reject"
  desc "Safari extension that automatically rejects GDPR cookie consent pop-ups"
  homepage "https://github.com/chadwishner/AutoGDPRRejectExtension"

  depends_on macos: ">= :sequoia"

  app "Auto GDPR Reject.app"

  caveats <<~EOS
    Open "Auto GDPR Reject" once, then enable the extension in
    Safari Settings -> Extensions and allow it on every website.
  EOS
end
