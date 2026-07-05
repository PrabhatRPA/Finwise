import Foundation
import UIKit
import Capacitor

/// Reads/writes a single JSON snapshot file in the app's iCloud Drive ubiquity
/// container so the same data can be synced across the user's iPhone and iPad.
/// All data still lives on-device in SQLite; this only mirrors a full-data
/// snapshot to iCloud (last-writer-wins).
///
/// Two sync-critical details live here:
///  1. STALE-CACHE GUARD — iCloud keeps a local cached copy of the file on
///     every device, and `fileExists` is true for the OLD copy. Before any
///     read/info we check `ubiquitousItemDownloadingStatus == .current` and
///     force-download until the local copy IS the latest version. Skipping
///     this was the root cause of "sync never arrives".
///  2. KV DOORBELL — a tiny beacon in NSUbiquitousKeyValueStore propagates in
///     seconds and fires didChangeExternally on other running devices; we
///     forward it to JS as a "kvChanged" event so the other device pulls
///     immediately instead of waiting for its next poll.
@objc(IcloudSync)
public class IcloudSync: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IcloudSync"
    public let jsName = "IcloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kvGet", returnType: CAPPluginReturnPromise)
    ]

    // The explicit ubiquity container identifier. Using the explicit ID is more
    // reliable than passing nil (which relies on the entitlement array order).
    private let containerID = "iCloud.com.prabhat.nworth"

    public override func load() {
        // Listen for remote Key-Value changes (the sync doorbell) and forward
        // them to JS. Fires only while the app runs — launch/foreground
        // reconciliation covers the rest.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(kvStoreChanged(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default
        )
        NSUbiquitousKeyValueStore.default.synchronize()
    }

    @objc private func kvStoreChanged(_ note: Notification) {
        let keys = (note.userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String]) ?? []
        var data: [String: Any] = ["keys": keys]
        for k in keys {
            if let v = NSUbiquitousKeyValueStore.default.string(forKey: k) {
                data[k] = v
            }
        }
        notifyListeners("kvChanged", data: data)
    }

    // The Documents subfolder of the app's ubiquity container. nil when the user
    // isn't signed into iCloud or the capability isn't provisioned.
    private func documentsURL() -> URL? {
        guard let container = FileManager.default.url(forUbiquityContainerIdentifier: containerID) else {
            return nil
        }
        let docs = container.appendingPathComponent("Documents", isDirectory: true)
        if !FileManager.default.fileExists(atPath: docs.path) {
            try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        }
        return docs
    }

    private func fileURL(_ name: String) -> URL? {
        guard let docs = documentsURL() else { return nil }
        // Strip any path separators — callers pass a bare file name.
        let safe = (name as NSString).lastPathComponent
        return docs.appendingPathComponent(safe.isEmpty ? "nworth-icloud-snapshot.json" : safe)
    }

    // ── Stale-cache guard ────────────────────────────────────────────────
    // Ensure the local copy of a ubiquitous file IS the latest iCloud version.
    // Returns true when current, false on timeout (caller may still read the
    // cached copy but should mark it stale). Reads fresh resource values on a
    // new URL each pass — cached values would defeat the whole point.
    private func ensureCurrent(_ url: URL, timeoutSecs: Double) -> Bool {
        let fm = FileManager.default
        let deadline = Date().addingTimeInterval(timeoutSecs)
        var requestedDownload = false
        while Date() < deadline {
            let fresh = URL(fileURLWithPath: url.path)
            let values = try? fresh.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
            let status = values?.ubiquitousItemDownloadingStatus

            if status == .current {
                return true
            }
            // Not current (or unknown / not yet local) → ask iCloud to bring
            // the latest version down, then keep polling.
            if !requestedDownload || status == nil {
                try? fm.startDownloadingUbiquitousItem(at: url)
                requestedDownload = true
            }
            Thread.sleep(forTimeInterval: 0.25)
        }
        return false
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            // ubiquityIdentityToken is non-nil when the user is signed into iCloud.
            // This distinguishes "not signed in" from "entitlement/provisioning problem".
            let signedIn = FileManager.default.ubiquityIdentityToken != nil
            let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: self.containerID)
            let available = containerURL != nil

            call.resolve([
                "available": available,
                "signedIntoICloud": signedIn,
                "containerPath": containerURL?.path ?? ""
            ])
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let name = call.getString("fileName"),
              let contents = call.getString("contents") else {
            call.reject("fileName and contents are required")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let url = self.fileURL(name) else {
                call.reject("iCloud is not available")
                return
            }
            var coordError: NSError?
            var writeError: Error?
            NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordError) { writeURL in
                do {
                    try contents.write(to: writeURL, atomically: true, encoding: .utf8)
                } catch {
                    writeError = error
                }
            }
            if let err = coordError ?? (writeError as NSError?) {
                call.reject("Failed to write to iCloud: \(err.localizedDescription)")
                return
            }
            call.resolve([
                "success": true,
                "modifiedAt": self.modifiedAtMillis(url) as Any
            ])
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        let name = call.getString("fileName") ?? "nworth-icloud-snapshot.json"
        DispatchQueue.global(qos: .userInitiated).async {
            guard let url = self.fileURL(name) else {
                call.reject("iCloud is not available")
                return
            }
            // CRITICAL: wait until the local copy is the LATEST iCloud version
            // (fileExists alone happily returns yesterday's cached snapshot).
            let isCurrent = self.ensureCurrent(url, timeoutSecs: 15)

            guard FileManager.default.fileExists(atPath: url.path) else {
                call.resolve(["exists": false])
                return
            }
            var coordError: NSError?
            var contents: String?
            NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordError) { readURL in
                contents = try? String(contentsOf: readURL, encoding: .utf8)
            }
            guard let text = contents else {
                call.resolve(["exists": false])
                return
            }
            call.resolve([
                "exists": true,
                "contents": text,
                "modifiedAt": self.modifiedAtMillis(url) as Any,
                "stale": !isCurrent
            ])
        }
    }

    @objc func info(_ call: CAPPluginCall) {
        let name = call.getString("fileName") ?? "nworth-icloud-snapshot.json"
        DispatchQueue.global(qos: .userInitiated).async {
            guard let url = self.fileURL(name) else {
                call.resolve(["available": false, "exists": false])
                return
            }
            // Short freshness window — info() is the cheap fast-path probe;
            // the mtime it reports must be the CURRENT version's, or reconcile
            // will keep comparing against a stale timestamp.
            let isCurrent = self.ensureCurrent(url, timeoutSecs: 3)
            let exists = FileManager.default.fileExists(atPath: url.path)
            call.resolve([
                "available": true,
                "exists": exists,
                "modifiedAt": self.modifiedAtMillis(url) as Any,
                "deviceName": UIDevice.current.name,
                "stale": !isCurrent
            ])
        }
    }

    // ── Key-Value doorbell ───────────────────────────────────────────────

    @objc func kvSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        store.set(value, forKey: key)
        store.synchronize()
        call.resolve(["success": true])
    }

    @objc func kvGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        store.synchronize()
        call.resolve(["value": store.string(forKey: key) ?? ""])
    }

    // File modification time in epoch milliseconds, or nil if unavailable.
    private func modifiedAtMillis(_ url: URL) -> Double? {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let date = attrs[.modificationDate] as? Date else {
            return nil
        }
        return date.timeIntervalSince1970 * 1000
    }
}
