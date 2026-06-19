use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Default)]
pub struct AgentRuntimeState {
    runtime: Mutex<AgentRuntime>,
}

#[derive(Default)]
struct AgentRuntime {
    sessions: HashMap<String, AiSessionInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentCapabilities {
    pub read_workspace: bool,
    pub write_workspace: bool,
    pub shell: bool,
    pub diff: bool,
    pub models: bool,
    pub slash_commands: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentProfile {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub provider_id: String,
    pub provider_label: String,
    pub model_id: String,
    pub model_label: String,
    pub is_test_runtime: bool,
    pub capabilities: AiAgentCapabilities,
    pub detection: AiAgentDetection,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAgentDetection {
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiDetectedModel {
    pub id: String,
    pub label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub profile_id: String,
    pub available: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiAssistantAccount {
    pub id: String,
    pub label: String,
    pub provider_id: String,
    pub provider_label: String,
    pub status: String,
    pub command_path: Option<String>,
    pub version: Option<String>,
    pub transport: Option<String>,
    pub message: Option<String>,
    pub models: Vec<AiDetectedModel>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct CommandDetection {
    command_path: Option<PathBuf>,
    version: Option<String>,
    app_server_supported: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionInfo {
    pub session_id: String,
    pub profile_id: String,
    pub root_path: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartAiSessionInput {
    pub root_path: String,
    pub profile_id: String,
    pub context: AiContextPack,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendAiPromptInput {
    pub session_id: String,
    pub prompt: String,
    pub context: AiContextPack,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextPack {
    pub workspace_root_path: String,
    pub intent: String,
    pub document: Option<AiContextDocument>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiContextDocument {
    pub path: String,
    pub title: String,
    pub markdown: String,
    pub modified_at: Option<u128>,
    pub content_hash: String,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiRuntimeEvent {
    SessionStarted {
        session: AiSessionInfo,
    },
    MessageDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        delta: String,
    },
    MessageCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
    },
    TurnCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        cancelled: bool,
    },
    SessionExited {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Error {
        #[serde(rename = "sessionId")]
        session_id: Option<String>,
        message: String,
    },
}

#[tauri::command]
pub fn list_ai_agent_profiles(root_path: String) -> Result<Vec<AiAgentProfile>, String> {
    validate_agent_root(&root_path)?;

    let accounts = detect_ai_accounts_raw();
    let mut profiles = vec![fake_echo_profile()];

    profiles.extend(detected_model_profiles(&accounts));

    Ok(profiles)
}

#[tauri::command]
pub fn detect_ai_accounts() -> Result<Vec<AiAssistantAccount>, String> {
    Ok(detect_ai_accounts_raw())
}

#[tauri::command]
pub fn start_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: StartAiSessionInput,
) -> Result<AiSessionInfo, String> {
    let root = validate_agent_root(&input.root_path)?;

    if input.profile_id != "fake-echo" {
        return Err("AI agent profile 不可用".to_string());
    }

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;
    let session = runtime.start_session(input.profile_id, root);
    emit_ai_event(
        &app,
        AiRuntimeEvent::SessionStarted {
            session: session.clone(),
        },
    );

    Ok(session)
}

#[tauri::command]
pub fn send_ai_prompt(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: SendAiPromptInput,
) -> Result<(), String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    if !runtime.has_session(&input.session_id) {
        emit_ai_event(
            &app,
            AiRuntimeEvent::Error {
                message: "AI 会话不存在".to_string(),
                session_id: Some(input.session_id),
            },
        );
        return Err("AI 会话不存在".to_string());
    }

    drop(runtime);

    let message_id = Uuid::new_v4().to_string();
    let response = build_fake_response(&input);

    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageDelta {
            delta: response,
            message_id: message_id.clone(),
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::MessageCompleted {
            message_id,
            session_id: input.session_id.clone(),
        },
    );
    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: false,
            session_id: input.session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn cancel_ai_turn(app: AppHandle, session_id: String) -> Result<(), String> {
    emit_ai_event(
        &app,
        AiRuntimeEvent::TurnCompleted {
            cancelled: true,
            session_id,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn stop_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<(), String> {
    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    runtime.stop_session(&session_id)?;
    emit_ai_event(&app, AiRuntimeEvent::SessionExited { session_id });

    Ok(())
}

impl AgentRuntime {
    fn start_session(&mut self, profile_id: String, root: PathBuf) -> AiSessionInfo {
        let session = AiSessionInfo {
            profile_id,
            root_path: root.to_string_lossy().to_string(),
            session_id: Uuid::new_v4().to_string(),
            status: "running".to_string(),
        };

        self.sessions
            .insert(session.session_id.clone(), session.clone());

        session
    }

    fn has_session(&self, session_id: &str) -> bool {
        self.sessions.contains_key(session_id)
    }

    fn stop_session(&mut self, session_id: &str) -> Result<(), String> {
        self.sessions
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| "AI 会话不存在".to_string())
    }
}

fn fake_echo_profile() -> AiAgentProfile {
    AiAgentProfile {
        capabilities: AiAgentCapabilities {
            diff: false,
            models: false,
            read_workspace: true,
            shell: false,
            slash_commands: false,
            write_workspace: false,
        },
        detection: AiAgentDetection {
            message: None,
            status: "available".to_string(),
        },
        id: "fake-echo".to_string(),
        is_test_runtime: true,
        kind: "fake".to_string(),
        label: "Fake Echo".to_string(),
        model_id: "fake-echo".to_string(),
        model_label: "fake-echo".to_string(),
        provider_id: "local".to_string(),
        provider_label: "Local".to_string(),
    }
}

fn detect_ai_accounts_raw() -> Vec<AiAssistantAccount> {
    build_detected_accounts(detect_codex_command(), detect_claude_command())
}

fn detect_codex_command() -> CommandDetection {
    let command_path = find_command_path("codex").or_else(|| {
        let bundled_path = PathBuf::from("/Applications/Codex.app/Contents/Resources/codex");

        bundled_path.exists().then_some(bundled_path)
    });
    let Some(path) = command_path else {
        return CommandDetection::default();
    };

    let version = run_command_output(&path, &["--version"]);
    let app_server_supported = run_command_output(&path, &["app-server", "--help"])
        .map(|output| output.contains("app-server"))
        .unwrap_or(false);

    CommandDetection {
        app_server_supported,
        command_path: Some(path),
        version,
    }
}

fn detect_claude_command() -> CommandDetection {
    let Some(path) = find_command_path("claude") else {
        return CommandDetection::default();
    };

    CommandDetection {
        app_server_supported: false,
        command_path: Some(path.clone()),
        version: run_command_output(&path, &["--version"]),
    }
}

fn build_detected_accounts(
    codex: CommandDetection,
    claude: CommandDetection,
) -> Vec<AiAssistantAccount> {
    vec![build_codex_account(codex), build_claude_account(claude)]
}

fn build_codex_account(detection: CommandDetection) -> AiAssistantAccount {
    let detected = detection.command_path.is_some();
    let connected = detected && detection.app_server_supported;

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "codex".to_string(),
        label: "Codex".to_string(),
        message: Some(if connected {
            "Local Codex app-server detected. Runtime adapter will use this account without storing API keys."
                .to_string()
        } else if detected {
            "Codex CLI detected, but app-server support was not found.".to_string()
        } else {
            "Codex CLI was not found on PATH.".to_string()
        }),
        models: codex_models(connected),
        provider_id: "openai".to_string(),
        provider_label: "OpenAI".to_string(),
        status: if connected {
            "connected"
        } else if detected {
            "misconfigured"
        } else {
            "missing"
        }
        .to_string(),
        transport: connected.then(|| "app-server".to_string()),
        version: detection.version,
    }
}

fn build_claude_account(detection: CommandDetection) -> AiAssistantAccount {
    let detected = detection.command_path.is_some();

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "claude".to_string(),
        label: "Claude".to_string(),
        message: Some(if detected {
            "Claude CLI detected. ACP/app-server adapter is pending before it can run inside the AI panel."
                .to_string()
        } else {
            "Claude CLI was not found on PATH.".to_string()
        }),
        models: Vec::new(),
        provider_id: "anthropic".to_string(),
        provider_label: "Anthropic".to_string(),
        status: if detected { "detected" } else { "missing" }.to_string(),
        transport: detected.then(|| "cli".to_string()),
        version: detection.version,
    }
}

fn codex_models(connected: bool) -> Vec<AiDetectedModel> {
    [
        ("gpt-5.5", "GPT-5.5"),
        ("gpt-5.4", "GPT-5.4"),
        ("gpt-5.4-mini", "GPT-5.4-Mini"),
        ("gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark"),
    ]
    .into_iter()
    .map(|(id, label)| AiDetectedModel {
        available: false,
        id: id.to_string(),
        label: label.to_string(),
        profile_id: format!("codex:{id}"),
        provider_id: "openai".to_string(),
        provider_label: "OpenAI".to_string(),
    })
    .map(|mut model| {
        if !connected {
            model.available = false;
        }
        model
    })
    .collect()
}

fn detected_model_profiles(accounts: &[AiAssistantAccount]) -> Vec<AiAgentProfile> {
    accounts
        .iter()
        .flat_map(|account| {
            account.models.iter().map(|model| AiAgentProfile {
                capabilities: AiAgentCapabilities {
                    diff: true,
                    models: true,
                    read_workspace: true,
                    shell: false,
                    slash_commands: true,
                    write_workspace: true,
                },
                detection: AiAgentDetection {
                    message: Some(
                        "检测到本地账号和模型目录；Codex app-server runtime adapter 尚未接入。"
                            .to_string(),
                    ),
                    status: "misconfigured".to_string(),
                },
                id: model.profile_id.clone(),
                is_test_runtime: false,
                kind: match account.id.as_str() {
                    "codex" => "codex_app_server",
                    _ => "provider",
                }
                .to_string(),
                label: format!("{} / {}", account.label, model.label),
                model_id: model.id.clone(),
                model_label: model.label.clone(),
                provider_id: model.provider_id.clone(),
                provider_label: model.provider_label.clone(),
            })
        })
        .collect()
}

fn find_command_path(command: &str) -> Option<PathBuf> {
    let path_value = env::var_os("PATH")?;

    for directory in env::split_paths(&path_value) {
        let candidate = directory.join(command);

        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(windows)]
        {
            let exe_candidate = directory.join(format!("{command}.exe"));

            if exe_candidate.is_file() {
                return Some(exe_candidate);
            }
        }
    }

    None
}

fn run_command_output(path: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new(path).args(args).output().ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let text = if stdout.is_empty() { stderr } else { stdout };

    (!text.is_empty()).then_some(text)
}

fn build_fake_response(input: &SendAiPromptInput) -> String {
    match input.context.document.as_ref() {
        Some(document) => format!(
            "Echo: {}\n\nContext: {} ({})",
            input.prompt, document.title, document.content_hash
        ),
        None => format!("Echo: {}", input.prompt),
    }
}

fn validate_agent_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn emit_ai_event(app: &AppHandle, event: AiRuntimeEvent) {
    let _ = app.emit("ai:event", event);
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_context(root: &str) -> AiContextPack {
        AiContextPack {
            document: None,
            intent: "chat".to_string(),
            workspace_root_path: root.to_string(),
        }
    }

    #[test]
    fn fake_profile_is_available_and_read_only() {
        let profile = fake_echo_profile();

        assert_eq!(profile.id, "fake-echo");
        assert_eq!(profile.detection.status, "available");
        assert!(profile.capabilities.read_workspace);
        assert!(!profile.capabilities.write_workspace);
        assert!(!profile.capabilities.shell);
    }

    #[test]
    fn fake_profile_exposes_provider_and_model_metadata() {
        let profile = fake_echo_profile();
        let value = serde_json::to_value(profile).expect("profile should serialize");

        assert_eq!(value["providerId"], "local");
        assert_eq!(value["providerLabel"], "Local");
        assert_eq!(value["modelId"], "fake-echo");
        assert_eq!(value["modelLabel"], "fake-echo");
        assert_eq!(value["isTestRuntime"], true);
    }

    #[test]
    fn account_detection_reports_codex_and_claude_metadata() {
        let accounts = build_detected_accounts(
            CommandDetection {
                app_server_supported: true,
                command_path: Some(PathBuf::from("/usr/local/bin/codex")),
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection {
                app_server_supported: false,
                command_path: Some(PathBuf::from("/usr/local/bin/claude")),
                version: Some("2.1.161 (Claude Code)".to_string()),
            },
        );

        let codex = accounts
            .iter()
            .find(|account| account.id == "codex")
            .expect("codex account should be reported");
        let claude = accounts
            .iter()
            .find(|account| account.id == "claude")
            .expect("claude account should be reported");

        assert_eq!(codex.status, "connected");
        assert_eq!(codex.transport.as_deref(), Some("app-server"));
        assert_eq!(codex.version.as_deref(), Some("codex-cli 0.130.0"));
        assert!(codex.models.iter().any(|model| model.id == "gpt-5.4"));
        assert_eq!(claude.status, "detected");
        assert_eq!(claude.transport.as_deref(), Some("cli"));
    }

    #[test]
    fn detected_model_profiles_are_marked_pending_until_adapter_exists() {
        let accounts = build_detected_accounts(
            CommandDetection {
                app_server_supported: true,
                command_path: Some(PathBuf::from("/usr/local/bin/codex")),
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection::default(),
        );
        let profiles = detected_model_profiles(&accounts);

        let profile = profiles
            .iter()
            .find(|profile| profile.id == "codex:gpt-5.4")
            .expect("codex model profile should be generated");

        assert_eq!(profile.kind, "codex_app_server");
        assert_eq!(profile.provider_label, "OpenAI");
        assert_eq!(profile.detection.status, "misconfigured");
        assert!(!profile.is_test_runtime);
    }

    #[test]
    fn validates_existing_directory_as_agent_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let root = validate_agent_root(&temp_dir.path().to_string_lossy()).expect("校验工作区失败");

        assert_eq!(root, temp_dir.path().canonicalize().unwrap());
    }

    #[test]
    fn rejects_missing_agent_root() {
        let error =
            validate_agent_root("/definitely/missing/refinex/wiki").expect_err("缺失路径应失败");

        assert!(error.contains("工作区路径不可用"));
    }

    #[test]
    fn starts_and_stops_session() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let mut runtime = AgentRuntime::default();

        let session = runtime.start_session(
            "fake-echo".to_string(),
            temp_dir.path().canonicalize().unwrap(),
        );

        assert!(runtime.has_session(&session.session_id));
        runtime
            .stop_session(&session.session_id)
            .expect("停止 session 失败");
        assert!(!runtime.has_session(&session.session_id));
    }

    #[test]
    fn fake_response_includes_document_context_when_available() {
        let input = SendAiPromptInput {
            context: AiContextPack {
                document: Some(AiContextDocument {
                    content_hash: "fnv1a-abc".to_string(),
                    dirty: false,
                    markdown: "# 指南".to_string(),
                    modified_at: None,
                    path: "/repo/guide.md".to_string(),
                    title: "指南".to_string(),
                }),
                intent: "summarize-document".to_string(),
                workspace_root_path: "/repo".to_string(),
            },
            prompt: "总结此页面".to_string(),
            session_id: "ai-1".to_string(),
        };

        assert_eq!(
            build_fake_response(&input),
            "Echo: 总结此页面\n\nContext: 指南 (fnv1a-abc)"
        );
    }

    #[test]
    fn list_profiles_requires_valid_root() {
        let temp_dir = TempDir::new().expect("创建临时目录失败");
        let profiles = list_ai_agent_profiles(temp_dir.path().to_string_lossy().to_string())
            .expect("读取 profile 失败");

        assert!(profiles
            .iter()
            .any(|profile| profile == &fake_echo_profile()));
        assert!(profiles
            .iter()
            .all(|profile| !profile.provider_id.is_empty() && !profile.model_id.is_empty()));
    }

    #[test]
    fn context_helper_is_used_by_tests() {
        let context = test_context("/repo");

        assert_eq!(context.workspace_root_path, "/repo");
        assert_eq!(context.intent, "chat");
    }
}
