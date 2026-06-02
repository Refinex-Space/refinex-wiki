mod assets;
mod git;
mod settings;
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
            assets::upload_workspace_asset,
            assets::resolve_workspace_asset,
            assets::read_workspace_asset_data,
            git::git_probe,
            git::git_init,
            git::git_status,
            git::git_diff,
            git::git_commit_file_diff,
            git::git_branches,
            git::git_log,
            git::git_commit_files,
            git::git_stage,
            git::git_unstage,
            git::git_commit,
            git::git_push,
            git::git_revert_file,
            git::git_delete_file,
            settings::read_app_settings,
            settings::save_app_settings,
            workspace::ensure_workspace,
            workspace::load_workspace_tree,
            workspace::create_workspace_root,
            workspace::read_plate_document,
            workspace::save_plate_document,
            workspace::create_plate_document,
            workspace::create_workspace_directory,
            workspace::rename_workspace_node,
            workspace::delete_workspace_node,
            workspace::move_workspace_node,
            workspace::read_markdown_source_files,
            workspace::read_import_source_files,
            workspace::create_imported_plate_documents,
            workspace::write_export_file,
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
