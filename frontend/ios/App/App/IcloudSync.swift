import Foundation
import UIKit
import Capacitor

/// Reads/writes a single JSON snapshot file in the app's iCloud Drive ubiquity
/// container so the same data can be synced across the user's iPhone and iPad.
/// All data still lives on-device in SQLite; this only mirrors a full-data
/// snapshot to iCloud for backup + restore (last-writer-wins).
@objc(IcloudSync)
public class IcloudSync: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IcloudSync"
    public let jsName = "IcloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise)
    ]

    // The Documents subfolder of the default ubiquity container (the first
    // container listed in the app's entitlements). nil when the user isn't
    // signed into iCloud or the capability isn't provisioned.
    private func documentsURL() -> URL? {
        guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
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

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let available = FileManager.default.url(forUbiquityContainerIdentifier: nil) != nil
            call.resolve(["available": available])
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
            // Make sure the latest version is pulled down from iCloud before we read.
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
            // Brief wait for the download to materialize the file.
            // 60 × 0.25 s = 15 s total; slow iCloud connections need more than 5 s.
            for _ in 0..<60 {
                if FileManager.default.fileExists(atPath: url.path) { break }
                Thread.sleep(forTimeInterval: 0.25)
            }
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
                "modifiedAt": self.modifiedAtMillis(url) as Any
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
            let exists = FileManager.default.fileExists(atPath: url.path)
            call.resolve([
                "available": true,
                "exists": exists,
                "modifiedAt": self.modifiedAtMillis(url) as Any,
                "deviceName": UIDevice.current.name
            ])
        }
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
