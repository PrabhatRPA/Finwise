use std::io::Write as _;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

/// Holds the spawned backend process so we can kill it on window close.
struct BackendChild(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendChild(Mutex::new(None)))
        .setup(|app| {
            // ── 1. Resolve the app-data directory for persistent storage ──────
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

            // ── 2. Open a log file for sidecar stdout/stderr ──────────────────
            let log_path = app_data_dir.join("sidecar.log");
            let log_path_clone = log_path.clone();

            // ── 3. Spawn the Python FastAPI backend sidecar ───────────────────
            let (rx, child) = app
                .shell()
                .sidecar("backend")
                .expect("backend sidecar binary not found in binaries/")
                .args(["--app-data-dir", &app_data_str])
                .spawn()
                .expect("failed to spawn backend sidecar");

            *app.state::<BackendChild>().0.lock().unwrap() = Some(child);

            // ── 4. Drain sidecar output on a background task ─────────────────
            // Keeping `rx` alive (not dropping it) ensures the process channel
            // stays open; we also write everything to sidecar.log so problems
            // are diagnosable without a terminal.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut log = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path_clone)
                    .ok();

                // Write a session separator so log entries don't run together.
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
                            // The backend exited — show an alert in the window.
                            let code = payload.code.unwrap_or(-1);
                            let log_display = log_path_clone.display();
                            let msg = format!(
                                "Finwise backend stopped unexpectedly (exit code {code}).\n\n\
                                 Diagnosis log:\n{log_display}\n\n\
                                 Try reinstalling the app or check that no other process is \
                                 using port 8000."
                            );
                            if let Some(win) = app_handle.get_webview_window("main") {
                                // alert() shows a native dialog inside the WebView —
                                // no plugin required.
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

            Ok(())
        })
        // ── 5. Kill the backend when the last window closes ───────────────────
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
