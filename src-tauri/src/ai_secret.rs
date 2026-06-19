use serde::Serialize;
#[cfg(test)]
use std::collections::HashMap;
#[cfg(test)]
use std::sync::Mutex;

const SERVICE_NAME: &str = "refinex-wiki.ai-provider";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSecretStatus {
    pub status: String,
}

trait SecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String>;
    fn exists(&self, provider_id: &str) -> Result<bool, String>;
    fn read(&self, provider_id: &str) -> Result<Option<String>, String>;
    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String>;
}

struct KeyringSecretBackend;

impl SecretBackend for KeyringSecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(sanitize_secret_error(error)),
        }
    }

    fn exists(&self, provider_id: &str) -> Result<bool, String> {
        self.read(provider_id).map(|value| value.is_some())
    }

    fn read(&self, provider_id: &str) -> Result<Option<String>, String> {
        let entry =
            keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(sanitize_secret_error(error)),
        }
    }

    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String> {
        let entry =
            keyring::Entry::new(SERVICE_NAME, provider_id).map_err(sanitize_secret_error)?;
        entry.set_password(secret).map_err(sanitize_secret_error)
    }
}

#[cfg(test)]
#[derive(Default)]
struct InMemorySecretBackend {
    values: Mutex<HashMap<String, String>>,
}

#[cfg(test)]
impl SecretBackend for InMemorySecretBackend {
    fn delete(&self, provider_id: &str) -> Result<(), String> {
        self.values
            .lock()
            .map_err(|_| "secret store lock failed".to_string())?
            .remove(provider_id);
        Ok(())
    }

    fn exists(&self, provider_id: &str) -> Result<bool, String> {
        Ok(self
            .values
            .lock()
            .map_err(|_| "secret store lock failed".to_string())?
            .contains_key(provider_id))
    }

    fn read(&self, provider_id: &str) -> Result<Option<String>, String> {
        Ok(self
            .values
            .lock()
            .map_err(|_| "secret store lock failed".to_string())?
            .get(provider_id)
            .cloned())
    }

    fn write(&self, provider_id: &str, secret: &str) -> Result<(), String> {
        self.values
            .lock()
            .map_err(|_| "secret store lock failed".to_string())?
            .insert(provider_id.to_string(), secret.to_string());
        Ok(())
    }
}

#[tauri::command]
pub fn get_ai_provider_secret_status(provider_id: String) -> Result<AiSecretStatus, String> {
    get_secret_status_with_backend(&KeyringSecretBackend, &provider_id)
}

#[tauri::command]
pub fn save_ai_provider_secret(
    provider_id: String,
    secret: String,
) -> Result<AiSecretStatus, String> {
    save_secret_with_backend(&KeyringSecretBackend, &provider_id, &secret)
}

#[tauri::command]
pub fn delete_ai_provider_secret(provider_id: String) -> Result<AiSecretStatus, String> {
    delete_secret_with_backend(&KeyringSecretBackend, &provider_id)
}

pub(crate) fn read_ai_provider_secret(provider_id: &str) -> Result<Option<String>, String> {
    validate_secret_provider_id(provider_id)?;
    KeyringSecretBackend.read(provider_id)
}

fn get_secret_status_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;

    Ok(AiSecretStatus {
        status: if backend.exists(provider_id)? {
            "configured"
        } else {
            "missing"
        }
        .to_string(),
    })
}

fn save_secret_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
    secret: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;
    if secret.trim().is_empty() {
        return Err("AI provider secret 不能为空".to_string());
    }

    backend.write(provider_id, secret.trim())?;
    get_secret_status_with_backend(backend, provider_id)
}

fn delete_secret_with_backend(
    backend: &impl SecretBackend,
    provider_id: &str,
) -> Result<AiSecretStatus, String> {
    validate_secret_provider_id(provider_id)?;
    backend.delete(provider_id)?;
    get_secret_status_with_backend(backend, provider_id)
}

fn validate_secret_provider_id(provider_id: &str) -> Result<(), String> {
    let valid = !provider_id.is_empty()
        && provider_id.len() <= 80
        && provider_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.');

    if valid {
        Ok(())
    } else {
        Err("AI provider id 不安全".to_string())
    }
}

fn sanitize_secret_error(error: impl std::fmt::Display) -> String {
    let text = error.to_string();
    if text.trim().is_empty() {
        "system secret store failed".to_string()
    } else {
        format!("system secret store failed: {text}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_secret_provider_ids() {
        assert!(validate_secret_provider_id("openai").is_ok());
        assert!(validate_secret_provider_id("custom-openai-compatible-1").is_ok());
        assert!(validate_secret_provider_id("../openai").is_err());
        assert!(validate_secret_provider_id("openai token").is_err());
        assert!(validate_secret_provider_id("").is_err());
    }

    #[test]
    fn fake_secret_backend_round_trips_status_without_exposing_value() {
        let backend = InMemorySecretBackend::default();

        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus {
                status: "missing".to_string()
            },
        );
        save_secret_with_backend(&backend, "openai", "sk-test").expect("save");
        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus {
                status: "configured".to_string()
            },
        );
        delete_secret_with_backend(&backend, "openai").expect("delete");
        assert_eq!(
            get_secret_status_with_backend(&backend, "openai").expect("status"),
            AiSecretStatus {
                status: "missing".to_string()
            },
        );
    }
}
