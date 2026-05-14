use std::io::Write as _;
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

/// Holds the spawned backend process so we can kill it on window close.
struct BackendChild(Mutex<Option<CommandChild>>);

/// On macOS, macOS applies a quarantine xattr to everything that comes from
/// the internet (including sidecar binaries inside a DMG-installed app).
/// The user can bypass Gatekeeper for the main .app by right-clicking → Open,
/// but child processes inside the bundle still carry the quarantine flag and
/// are silently blocked when the app tries to spawn them.
///
/// This strips the quarantine from the entire .app bundle on first run so
/// subsequent sidecar spawns succeed without any Gatekeeper prompt.
#[cfg(target_os = "macos")]
fn strip_quarantine() {
    if let Ok(exe) = std::env::current_exe() {
        // exe = …/Finwise.app/Contents/MacOS/finwise
        // go up 3 levels: MacOS → Contents → Finwise.app
        if let Some(bundle) = exe
            .parent()
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
        {
            let _ = std::process::Command::new("xattr")
                .args(["-rd", "com.apple.quarantine", &bundle.to_string_lossy()])
                .output();
        }
    }
}

/// Poll TCP port 8000 until the backend is accepting connections or the
/// deadline is reached. Returns true if the backend came up in time.
fn wait_for_backend(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &"127.0.0.1:8000".parse().unwrap(),
            Duration::from_millis(300),
        )
        .is_ok()
        {
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
            // ── 1. Strip macOS quarantine from the whole bundle ───────────────
            // This must happen before we spawn the sidecar, otherwise macOS may
            // silently kill the sidecar process at exec time.
            #[cfg(target_os = "macos")]
            strip_quarantine();

            // ── 2. Resolve the app-data directory ────────────────────────────
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
            let _log_path_clone = log_path.clone();

            // ── 4. Spawn the Python FastAPI backend sidecar ───────────────────
            let (rx, child) = app
                .shell()
                .sidecar("backend")
                .expect("backend sidecar binary not found in binaries/")
                .args(["--app-data-dir", &app_data_str])
                .spawn()
                .expect("failed to spawn backend sidecar");

            *app.state::<BackendChild>().0.lock().unwrap() = Some(child);

            // ── 5. Drain sidecar output → log file ───────────────────────────
            let app_handle_log = app.handle().clone();
            let log_path_log = log_path.clone();
            tauri::async_runtime::spawn(async move {
                let mut log = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path_log)
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
                            let log_display = log_path_log.display();
                            let msg = format!(
                                "Finwise backend stopped unexpectedly (exit code {code}).\n\n\
                                 Diagnosis log:\n{log_display}\n\n\
                                 Try reinstalling the app or check that no other process \
                                 is using port 8000."
                            );
                            if let Some(win) = app_handle_log.get_webview_window("main") {
                                let js = format!(
                                    "alert({})",
                                    serde_json::to_string(&msg)
                                        .unwrap_or_else(|_| "\"Backend crashed\"".into())
                                );
                                let _ = win.eval(&js);
                            }
                            break;
                        }
                        CommandEvent::Error(err) => {
                            if let Some(ref mut f) = log {
                                let _ = writeln!(f, "[sidecar error] {err}");
                            }
                        }
                        _ => {}
                    }
                }
            });

            // ── 6. Wait for backend → then show window ────────────────────────
            // The window starts hidden (visible:false in tauri.conf.json).
            // We poll port 8000 in a background OS thread so the UI thread is
            // free, then reveal the window once the backend is accepting
            // connections (or after a 60-second safety timeout).
            let app_handle_show = app.handle().clone();
            std::thread::spawn(move || {
                let ready = wait_for_backend(Duration::from_secs(60));

                if let Some(win) = app_handle_show.get_webview_window("main") {
                    if !ready {
                        // Backend didn't respond — show the window anyway so the
                        // user can see the error dialog that the async task will emit.
                        let _ = win.eval("window.__backendTimedOut = true");
                    }
                    let _ = win.show();
                    let _ = win.set_focus();
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
