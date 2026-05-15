use std::io::Write as _;
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

/// Holds the spawned backend process so we can kill it on window close.
struct BackendChild(Mutex<Option<CommandChild>>);

/// Strip the macOS quarantine xattr from the entire app bundle.
///
/// macOS tags every file inside a DMG downloaded from the internet with
/// `com.apple.quarantine`. When the user right-clicks → Open the main app
/// binary that flag is cleared for THAT binary only. Every other file in
/// the bundle (including the backend sidecar) keeps the flag and is silently
/// killed by macOS at exec time when the app tries to spawn it.
///
/// We use the FULL PATH `/usr/bin/xattr` because GUI apps on macOS launch
/// with a stripped PATH that may not include /usr/bin via the shell search.
#[cfg(target_os = "macos")]
fn strip_quarantine_macos() {
    // Walk up: finwise → MacOS → Contents → Finwise.app
    let bundle = std::env::current_exe().ok()
        .and_then(|exe| exe.parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .map(|p| p.to_path_buf()));

    if let Some(bundle_path) = bundle {
        // Recursively remove quarantine from the whole bundle.
        // -r = recursive, -d = delete the named attribute.
        let result = std::process::Command::new("/usr/bin/xattr")
            .args(["-rd", "com.apple.quarantine", &bundle_path.to_string_lossy()])
            .output();

        match result {
            Ok(out) if out.status.success() => {
                eprintln!("[finwise] quarantine stripped from {:?}", bundle_path);
            }
            Ok(out) => {
                eprintln!("[finwise] xattr warning: {}", String::from_utf8_lossy(&out.stderr));
                // Fallback: strip just the MacOS directory (sidecar lives here)
                let macos_dir = bundle_path.join("Contents").join("MacOS");
                let _ = std::process::Command::new("/usr/bin/xattr")
                    .args(["-rd", "com.apple.quarantine", &macos_dir.to_string_lossy()])
                    .output();
            }
            Err(e) => {
                eprintln!("[finwise] xattr not found: {e}");
            }
        }

        // Also explicitly remove the system policy that Gatekeeper adds for
        // unsigned apps, so subsequent launches work without right-click → Open.
        let _ = std::process::Command::new("/usr/sbin/spctl")
            .args(["--add", &bundle_path.to_string_lossy()])
            .output();
    }
}

/// Detect a partial-install where macOS's drag-replace into /Applications/
/// failed to overwrite the previous bundle's Contents/Frameworks/. Without
/// the Python framework in there the sidecar's PyInstaller bootloader will
/// fail with a cryptic "Failed to load Python shared library" error.
///
/// Returns true if the bundle looks complete (or if we're not inside an
/// .app bundle at all, e.g. dev mode).
#[cfg(target_os = "macos")]
fn is_install_complete() -> bool {
    let exe = match std::env::current_exe() { Ok(p) => p, Err(_) => return true };
    let macos_dir = match exe.parent() { Some(d) => d, None => return true };
    let contents_dir = match macos_dir.parent() { Some(d) => d, None => return true };
    // Only enforce inside a real .app bundle. Dev builds (target/debug/finwise)
    // don't sit under a Contents/ directory, so skip the check.
    if contents_dir.file_name().and_then(|s| s.to_str()) != Some("Contents") {
        return true;
    }
    contents_dir.join("Frameworks").join("Python").exists()
}

/// Poll TCP port 8000 until the backend is accepting connections or the
/// deadline is reached. Returns true if the backend came up in time.
fn wait_for_backend(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &"127.0.0.1:8000".parse().unwrap(),
            Duration::from_millis(300),
        ).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendChild(Mutex::new(None)))
        .setup(|app| {
            // ── 1. Strip macOS quarantine BEFORE spawning the sidecar ─────────
            // Must happen first — otherwise the sidecar binary is silently
            // blocked by Gatekeeper at exec time.
            #[cfg(target_os = "macos")]
            strip_quarantine_macos();

            // ── 1b. Detect partial-install on macOS ───────────────────────────
            // Drag-replace into /Applications/ doesn't always overwrite the
            // previous Contents/Frameworks/ contents. If the Python framework
            // is missing, the sidecar will spew a cryptic dlopen error and
            // the user is stuck. Short-circuit here and tell the frontend so
            // it can show a "reinstall fresh" message instead.
            #[cfg(target_os = "macos")]
            let install_ok = is_install_complete();
            #[cfg(not(target_os = "macos"))]
            let install_ok = true;

            if !install_ok {
                let log_dir = app.path().app_data_dir().ok();
                if let Some(dir) = &log_dir {
                    let _ = std::fs::create_dir_all(dir);
                    let log_path = dir.join("sidecar.log");
                    if let Ok(mut f) = std::fs::OpenOptions::new()
                        .create(true).append(true).open(&log_path)
                    {
                        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                        let _ = writeln!(
                            f,
                            "\n──── Finwise started {ts} ────\n[stale-install] Contents/Frameworks/Python is missing — partial install detected, skipping sidecar spawn"
                        );
                    }
                }
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(300));
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                        let _ = win.eval(
                            "window.__staleInstall = true; window.__backendStartFailed = true;",
                        );
                    }
                });
                return Ok(()); // skip sidecar spawn — it would only crash
            }

            // ── 2. App-data directory ─────────────────────────────────────────
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data dir");
            std::fs::create_dir_all(&app_data_dir)
                .expect("could not create app data dir");

            let app_data_str = app_data_dir
                .to_str()
                .expect("app data path is not valid UTF-8")
                .to_owned();

            // ── 3. Open sidecar log file ──────────────────────────────────────
            let log_path = app_data_dir.join("sidecar.log");

            // ── 4. Spawn the Python FastAPI backend sidecar ───────────────────
            let (rx, child) = app
                .shell()
                .sidecar("backend")
                .expect("backend sidecar binary not found in binaries/")
                .args(["--app-data-dir", &app_data_str])
                .spawn()
                .expect("failed to spawn backend sidecar");

            *app.state::<BackendChild>().0.lock().unwrap() = Some(child);

            // ── 5. Drain sidecar output → log and show crash dialog ───────────
            let app_handle_rx = app.handle().clone();
            let log_path_rx = log_path.clone();
            tauri::async_runtime::spawn(async move {
                let mut log = std::fs::OpenOptions::new()
                    .create(true).append(true)
                    .open(&log_path_rx)
                    .ok();

                if let Some(ref mut f) = log {
                    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                    let _ = writeln!(f, "\n──── Finwise started {ts} ────");
                }

                let mut rx = rx;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            if let Some(ref mut f) = log {
                                let _ = f.write_all(&bytes);
                                if !bytes.ends_with(b"\n") {
                                    let _ = f.write_all(b"\n");
                                }
                            }
                        }
                        CommandEvent::Terminated(payload) => {
                            let code = payload.code.unwrap_or(-1);
                            let log_str = log_path_rx.display().to_string();
                            if let Some(ref mut f) = log {
                                let _ = writeln!(f, "[terminated] exit code {code}");
                            }

                            // Show the window immediately so the user sees the error.
                            if let Some(win) = app_handle_rx.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.set_focus();
                                // Short delay for the webview to render before alert.
                                tokio::time::sleep(Duration::from_millis(1500)).await;
                                let msg = format!(
                                    "Finwise backend failed to start (exit code {code}).\n\n\
                                     This is usually caused by macOS security settings \
                                     or another process already using port 8000.\n\n\
                                     Diagnosis log:\n{log_str}\n\n\
                                     Try: right-click Finwise.app → Open, or \
                                     reinstall the app."
                                );
                                let js = format!(
                                    "alert({})",
                                    serde_json::to_string(&msg)
                                        .unwrap_or_else(|_| "\"Backend failed to start\"".into())
                                );
                                let _ = win.eval(&js);
                            }
                            break;
                        }
                        CommandEvent::Error(err) => {
                            if let Some(ref mut f) = log {
                                let _ = writeln!(f, "[error] {err}");
                            }
                        }
                        _ => {}
                    }
                }
            });

            // ── 6. Wait for backend, then reveal the window ───────────────────
            // The window is hidden at startup (visible:false in tauri.conf.json).
            // We poll port 8000 so the user never sees the login form before the
            // backend is ready. If the backend crashes, step 5 shows the window
            // early with an error. If it never starts within 60 s we show it
            // anyway so the frontend timeout message is visible.
            let app_handle_show = app.handle().clone();
            std::thread::spawn(move || {
                let ready = wait_for_backend(Duration::from_secs(60));
                if let Some(win) = app_handle_show.get_webview_window("main") {
                    // Only show if not already shown by the crash handler above.
                    let _ = win.show();
                    let _ = win.set_focus();
                    if !ready {
                        // Tell the frontend the backend timed out rather than
                        // silently enabling the login form.
                        let _ = win.eval("window.__backendStartFailed = true");
                    }
                }
            });

            Ok(())
        })
        // ── 7. Kill the backend when the last window closes ───────────────────
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<BackendChild>();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
