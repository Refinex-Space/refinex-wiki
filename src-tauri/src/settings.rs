use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub storage: StorageSettings,
    #[serde(default)]
    pub appearance: AppearanceSettings,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StorageSettings {
    pub default_provider: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub page_width_mode: String,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            page_width_mode: "wide".to_string(),
        }
    }
}

#[tauri::command]
pub fn read_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(default_app_settings());
    }

    let raw = fs::read_to_string(path).map_err(|_| "无法读取应用设置".to_string())?;
    serde_json::from_str::<AppSettings>(&raw).map_err(|_| "应用设置格式损坏".to_string())
}

#[tauri::command]
pub fn save_app_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    validate_app_settings(&settings)?;

    let path = settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建应用设置目录".to_string())?;
    }

    let json =
        serde_json::to_string_pretty(&settings).map_err(|_| "无法序列化应用设置".to_string())?;
    fs::write(&path, format!("{json}\n")).map_err(|_| "无法保存应用设置".to_string())?;

    Ok(settings)
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        schema_version: 1,
        storage: StorageSettings {
            default_provider: "local".to_string(),
        },
        appearance: AppearanceSettings::default(),
    }
}

fn validate_app_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.schema_version != 1 {
        return Err("应用设置版本不支持".to_string());
    }

    if settings.storage.default_provider != "local" {
        return Err("当前仅支持本地存储".to_string());
    }

    if settings.appearance.page_width_mode != "standard"
        && settings.appearance.page_width_mode != "wide"
    {
        return Err("页面宽度模式不支持".to_string());
    }

    Ok(())
}

fn settings_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|path| path.join("settings.json"))
        .map_err(|_| "无法定位应用设置目录".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_legacy_settings_without_appearance() {
        let settings: AppSettings =
            serde_json::from_str(r#"{"schemaVersion":1,"storage":{"defaultProvider":"local"}}"#)
                .expect("legacy settings should deserialize");

        assert_eq!(settings.appearance.page_width_mode, "wide");
    }

    #[test]
    fn rejects_invalid_page_width_mode() {
        let settings = AppSettings {
            schema_version: 1,
            storage: StorageSettings {
                default_provider: "local".to_string(),
            },
            appearance: AppearanceSettings {
                page_width_mode: "compact".to_string(),
            },
        };

        assert_eq!(
            validate_app_settings(&settings),
            Err("页面宽度模式不支持".to_string()),
        );
    }

    #[test]
    fn default_settings_include_wide_page_width() {
        let settings = default_app_settings();

        assert_eq!(settings.appearance.page_width_mode, "wide");
    }
}
