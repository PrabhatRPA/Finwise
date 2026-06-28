import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NSLog("[TIMING] AppDelegate.didFinishLaunching")
        // Register with iCloud so iOS shows this app under Settings → [Your
        // Name] → iCloud → iCloud Drive → Apps. Getting the container URL is
        // not enough — iOS only registers the app once it sees the Documents
        // folder created inside the container.
        //
        // Deferred ~4 s and run at background priority: the first-ever ubiquity
        // container call can be expensive, and we don't want it competing with
        // the WebView cold start. Visibility/registration isn't time-critical.
        DispatchQueue.global(qos: .background).asyncAfter(deadline: .now() + 4) {
            let signedIn = FileManager.default.ubiquityIdentityToken != nil
            guard let container = FileManager.default.url(
                forUbiquityContainerIdentifier: "iCloud.com.prabhat.nworth"
            ) else {
                NSLog("[AppDelegate] iCloud container URL is NIL (signedIntoICloud=\(signedIn)) — entitlement/provisioning issue")
                return
            }
            NSLog("[AppDelegate] iCloud container = \(container.path) (signedIntoICloud=\(signedIn))")
            let docs = container.appendingPathComponent("Documents", isDirectory: true)
            do {
                try FileManager.default.createDirectory(
                    at: docs, withIntermediateDirectories: true, attributes: nil
                )
                NSLog("[AppDelegate] iCloud Documents folder ensured at \(docs.path)")
            } catch {
                NSLog("[AppDelegate] failed to create iCloud Documents folder: \(error.localizedDescription)")
            }
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// Custom Capacitor bridge view controller that explicitly registers our
/// app-local IcloudSync plugin. App-embedded Capacitor plugins (ones defined
/// directly in the App target rather than as an npm package) are NOT reliably
/// auto-discovered in Capacitor's SPM setup, so the plugin's methods never
/// reach the JS bridge and IcloudSync.isAvailable() rejects — which is what
/// kept the Sync/Restore buttons disabled. Registering the instance here makes
/// the plugin reachable. Main.storyboard points its root view controller at
/// this class (customModule="Nworth").
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        NSLog("[TIMING] MainViewController.capacitorDidLoad — registering IcloudSync plugin")
        bridge?.registerPluginInstance(IcloudSync())
    }
}
