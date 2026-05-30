mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            workspace::ensure_workspace,
            workspace::load_workspace_tree,
            workspace::create_workspace_root,
            workspace::read_plate_document,
            workspace::save_plate_document,
            workspace::create_plate_document,
            workspace::create_workspace_directory,
            workspace::rename_workspace_node,
            workspace::delete_workspace_node,
            workspace::read_markdown_source_files,
            workspace::create_imported_plate_documents,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
