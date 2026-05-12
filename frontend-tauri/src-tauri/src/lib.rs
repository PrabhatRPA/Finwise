use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

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

            // ── 2. Spawn the Python FastAPI backend sidecar ───────────────────
            let app_data_str = app_data_dir
                .to_str()
                .expect("app data path is not valid UTF-8");

            let (_rx, child) = app
                .shell()
                .sidecar("backend")
                .expect("backend sidecar binary not found in binaries/")
                .args(["--app-data-dir", app_data_str])
                .spawn()
                .expect("failed to spawn backend sidecar");

            // Store the child handle so we can kill it when the window closes.
            *app.state::<BackendChild>().0.lock().unwrap() = Some(child);

            Ok(())
        })
        // ── 3. Kill the backend when the last window closes ───────────────────
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
