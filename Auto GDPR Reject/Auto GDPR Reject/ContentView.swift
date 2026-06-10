//
//  ContentView.swift
//  Auto GDPR Reject
//

import SafariServices
import SwiftUI

let extensionBundleIdentifier = "com.chadwishner.AutoGDPRReject.Extension"

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var extensionEnabled: Bool?

    var body: some View {
        VStack(spacing: 20) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 96, height: 96)

            Text(statusText)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button("Open Safari Extensions Settings…") {
                openSafariSettings()
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(40)
        .frame(width: 380)
        .task {
            await refreshState()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await refreshState() }
            }
        }
    }

    private var statusText: String {
        switch extensionEnabled {
        case .some(true):
            return "Auto GDPR Reject is enabled. Cookie consent pop-ups will be rejected for you.\n\nYou can turn it off in Safari Extensions settings."
        case .some(false):
            return "Auto GDPR Reject is currently disabled.\n\nTurn it on in Safari Extensions settings to reject cookie consent pop-ups automatically."
        case .none:
            return "Checking the extension’s status in Safari…"
        }
    }

    private func refreshState() async {
        let enabled = await withCheckedContinuation { continuation in
            SFSafariExtensionManager.getStateOfSafariExtension(
                withIdentifier: extensionBundleIdentifier
            ) { state, _ in
                continuation.resume(returning: state?.isEnabled)
            }
        }
        extensionEnabled = enabled
    }

    private func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: extensionBundleIdentifier
        ) { _ in
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }
}

#Preview {
    ContentView()
}
