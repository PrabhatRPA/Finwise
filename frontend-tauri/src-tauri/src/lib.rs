use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

/// Holds the spawned backend process so we can kill it on window close.
struct BackendChild(Mutex<Option<CommandChild>>);

/// Returns true if something is listening on 127.0.0.1:11434 (Ollama default).
fn is_ollama_running() -> bool {
    use std::net::TcpStream;
    TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().expect("valid addr"),
        Duration::from_secs(1),
    )
    .is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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

            // ── 3. Check for Ollama in the background (non-blocking) ──────────
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                // Give the backend a couple of seconds to start before checking
                // Ollama so the dialog doesn't appear while the splash is loading.
                std::thread::sleep(Duration::from_secs(3));
                if !is_ollama_running() {
                    handle
                        .dialog()
                        .message(
                            "Ollama is not running on localhost:11434.\n\n\
                             AI features that use local models (Ollama / LM Studio) \
                             will not be available.\n\n\
                             You can still use Claude or OpenAI — configure your \
                             provider in the AI Insights tab.\n\n\
                             To enable local AI: download Ollama from \
                             https://ollama.com and start it before launching this app.",
                        )
                        .title("Local AI Not Available")
                        .blocking_show();
                }
            });

            Ok(())
        })
        // ── 4. Kill the backend when the last window closes ───────────────────
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
