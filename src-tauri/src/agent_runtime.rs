use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

const CODEX_MODEL_CACHE_TTL: Duration = Duration::from_secs(300);
const CODEX_MODEL_LIST_TIMEOUT: Duration = Duration::from_secs(10);

static CODEX_MODEL_CACHE: OnceLock<Mutex<Option<CachedCodexModels>>> = OnceLock::new();

#[derive(Clone)]
struct CachedCodexModels {
    command_path: PathBuf,
    loaded_at: Instant,
    models: Vec<AiDetectedModel>,
}

#[derive(Default)]
pub struct AgentRuntimeState {
    runtime: Mutex<AgentRuntime>,
}

#[derive(Default)]
struct AgentRuntime {
    sessions: HashMap<String, AiSessionInfo>,
    codex_actors: HashMap<String, CodexSessionActor>,
}

#[derive(Clone)]
struct CodexSessionActor {
    sender: mpsc::Sender<CodexActorCommand>,
}

enum CodexActorCommand {
    SendPrompt { prompt: String },
    Interrupt,
    Stop,
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
    exec_supported: bool,
    stream_json_supported: bool,
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

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
#[allow(dead_code)]
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
    RunState {
        #[serde(rename = "sessionId")]
        session_id: String,
        state: String,
        #[serde(rename = "exitCode", skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    ThinkingDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "messageId")]
        message_id: String,
        delta: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolStarted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        input: serde_json::Value,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolInputDelta {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "partialJson")]
        partial_json: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    ToolCompleted {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        output: serde_json::Value,
        status: String,
        #[serde(rename = "durationMs", skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
    },
    PermissionPrompt {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
        reason: String,
        #[serde(rename = "parentToolCallId", skip_serializing_if = "Option::is_none")]
        parent_tool_call_id: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        suggestions: Option<serde_json::Value>,
    },
    PermissionDenied {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        #[serde(rename = "toolInput")]
        tool_input: serde_json::Value,
    },
    UsageUpdated {
        #[serde(rename = "sessionId")]
        session_id: String,
        #[serde(rename = "inputTokens")]
        input_tokens: u64,
        #[serde(rename = "outputTokens")]
        output_tokens: u64,
        #[serde(rename = "cacheReadTokens", skip_serializing_if = "Option::is_none")]
        cache_read_tokens: Option<u64>,
        #[serde(rename = "cacheWriteTokens", skip_serializing_if = "Option::is_none")]
        cache_write_tokens: Option<u64>,
        #[serde(rename = "totalCostUsd", skip_serializing_if = "Option::is_none")]
        total_cost_usd: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        model: Option<String>,
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
pub fn list_ai_agent_models(root_path: String) -> Result<Vec<AiDetectedModel>, String> {
    validate_agent_root(&root_path)?;

    let accounts = detect_ai_accounts_raw();
    let mut models = Vec::new();

    if let Some(codex) = accounts
        .iter()
        .find(|account| account.id == "codex" && account.status == "connected")
    {
        if let Some(command_path) = codex.command_path.as_deref() {
            models.extend(list_codex_models(Path::new(command_path))?);
        }
    }

    Ok(models)
}

#[tauri::command]
pub fn start_ai_session(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    input: StartAiSessionInput,
) -> Result<AiSessionInfo, String> {
    let root = validate_agent_root(&input.root_path)?;

    if input.profile_id != "fake-echo" && !is_available_detected_profile(&input.profile_id) {
        return Err("AI agent profile 不可用".to_string());
    }

    let session = create_session_info(input.profile_id.clone(), root.clone());
    let codex_actor = if input.profile_id == "codex:local" {
        Some(start_codex_actor(&app, &root, &session.session_id)?)
    } else {
        None
    };

    let mut runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;
    runtime.insert_session(session.clone(), codex_actor);
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

    let Some(session) = runtime.session(&input.session_id).cloned() else {
        emit_ai_event(
            &app,
            AiRuntimeEvent::Error {
                message: "AI 会话不存在".to_string(),
                session_id: Some(input.session_id),
            },
        );
        return Err("AI 会话不存在".to_string());
    };

    drop(runtime);

    if let Some(actor) = runtime_actor_for_session(&state, &input.session_id)? {
        actor
            .sender
            .send(CodexActorCommand::SendPrompt {
                prompt: build_assistant_prompt(&input),
            })
            .map_err(|_| "Codex 会话已停止".to_string())?;
        return Ok(());
    }

    let message_id = Uuid::new_v4().to_string();
    let response = build_runtime_response(&session, &input)?;

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
pub fn cancel_ai_turn(
    app: AppHandle,
    state: State<'_, AgentRuntimeState>,
    session_id: String,
) -> Result<(), String> {
    if let Some(actor) = runtime_actor_for_session(&state, &session_id)? {
        let _ = actor.sender.send(CodexActorCommand::Interrupt);
        return Ok(());
    }

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
    fn insert_session(&mut self, session: AiSessionInfo, codex_actor: Option<CodexSessionActor>) {
        if let Some(actor) = codex_actor {
            self.codex_actors.insert(session.session_id.clone(), actor);
        }
        self.sessions
            .insert(session.session_id.clone(), session.clone());
    }

    fn session(&self, session_id: &str) -> Option<&AiSessionInfo> {
        self.sessions.get(session_id)
    }

    fn stop_session(&mut self, session_id: &str) -> Result<(), String> {
        if let Some(actor) = self.codex_actors.remove(session_id) {
            let _ = actor.sender.send(CodexActorCommand::Stop);
        }
        self.sessions
            .remove(session_id)
            .map(|_| ())
            .ok_or_else(|| "AI 会话不存在".to_string())
    }
}

fn create_session_info(profile_id: String, root: PathBuf) -> AiSessionInfo {
    AiSessionInfo {
        profile_id,
        root_path: root.to_string_lossy().to_string(),
        session_id: Uuid::new_v4().to_string(),
        status: "running".to_string(),
    }
}

fn runtime_actor_for_session(
    state: &State<'_, AgentRuntimeState>,
    session_id: &str,
) -> Result<Option<CodexSessionActor>, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "AI runtime 状态锁已损坏".to_string())?;

    Ok(runtime.codex_actors.get(session_id).cloned())
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
    let exec_supported = run_command_output(&path, &["exec", "--help"])
        .map(|output| output.contains("Run Codex non-interactively"))
        .unwrap_or(false);

    CommandDetection {
        app_server_supported,
        command_path: Some(path),
        exec_supported,
        stream_json_supported: false,
        version,
    }
}

fn detect_claude_command() -> CommandDetection {
    let Some(path) = find_command_path("claude") else {
        return CommandDetection::default();
    };

    let help = run_command_output(&path, &["--help"]).unwrap_or_default();

    CommandDetection {
        app_server_supported: false,
        command_path: Some(path.clone()),
        exec_supported: false,
        stream_json_supported: help.contains("--print")
            && help.contains("--output-format")
            && help.contains("stream-json"),
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
    let connected = detected && detection.app_server_supported && detection.exec_supported;

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "codex".to_string(),
        label: "Codex".to_string(),
        message: Some(if connected {
            "Codex app-server 与非交互调用均可用；运行时将使用本地账号，不保存 API Key。"
                .to_string()
        } else if detected {
            "已检测到 Codex CLI，但 app-server 或 exec 能力不可用。".to_string()
        } else {
            "未在 PATH 中找到 Codex CLI。".to_string()
        }),
        models: Vec::new(),
        provider_id: "codex".to_string(),
        provider_label: "Codex".to_string(),
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
    let connected = detected && detection.stream_json_supported;

    AiAssistantAccount {
        command_path: detection
            .command_path
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        id: "claude".to_string(),
        label: "Claude Code".to_string(),
        message: Some(if detected {
            if connected {
                "Claude Code stream-json 调用可用；运行时将使用本地账号，不保存 API Key。"
                    .to_string()
            } else {
                "已检测到 Claude Code，但当前版本未暴露 stream-json 非交互调用能力。".to_string()
            }
        } else {
            "未在 PATH 中找到 Claude Code。".to_string()
        }),
        models: Vec::new(),
        provider_id: "claude".to_string(),
        provider_label: "Claude".to_string(),
        status: if connected {
            "connected"
        } else if detected {
            "misconfigured"
        } else {
            "missing"
        }
        .to_string(),
        transport: connected.then(|| "stream-json".to_string()),
        version: detection.version,
    }
}

fn detected_model_profiles(accounts: &[AiAssistantAccount]) -> Vec<AiAgentProfile> {
    accounts
        .iter()
        .filter(|account| matches!(account.id.as_str(), "codex" | "claude"))
        .map(|account| {
            let available = account.status == "connected";
            AiAgentProfile {
                capabilities: AiAgentCapabilities {
                    diff: true,
                    models: true,
                    read_workspace: true,
                    shell: false,
                    slash_commands: true,
                    write_workspace: true,
                },
                detection: AiAgentDetection {
                    message: if available {
                        None
                    } else {
                        Some("本地助手已检测到，但当前调用能力不可用。".to_string())
                    },
                    status: if available {
                        "available"
                    } else {
                        "misconfigured"
                    }
                    .to_string(),
                },
                id: format!("{}:local", account.id),
                is_test_runtime: false,
                kind: match account.id.as_str() {
                    "codex" => "codex_app_server",
                    "claude" => "claude_cli",
                    _ => "provider",
                }
                .to_string(),
                label: account.label.clone(),
                model_id: format!("{}:local", account.id),
                model_label: account.label.clone(),
                provider_id: account.provider_id.clone(),
                provider_label: account.provider_label.clone(),
            }
        })
        .collect()
}

fn list_codex_models(command_path: &Path) -> Result<Vec<AiDetectedModel>, String> {
    if let Some(models) = read_cached_codex_models(command_path) {
        return Ok(models);
    }

    match list_codex_models_uncached(command_path) {
        Ok(models) => {
            write_cached_codex_models(command_path, &models);
            Ok(models)
        }
        Err(error) => Err(format!(
            "{error}{}",
            codex_model_list_diagnostic(command_path)
                .map(|diagnostic| format!("；诊断：{diagnostic}"))
                .unwrap_or_default()
        )),
    }
}

fn list_codex_models_uncached(command_path: &Path) -> Result<Vec<AiDetectedModel>, String> {
    let mut child = Command::new(command_path)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "无法启动 Codex app-server".to_string())?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Codex app-server".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Codex app-server".to_string())?;

    write_codex_model_list_requests(&mut stdin)?;

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let result = read_codex_model_list_response(BufReader::new(stdout));
        let _ = tx.send(result);
    });

    let result = rx
        .recv_timeout(CODEX_MODEL_LIST_TIMEOUT)
        .map_err(|_| "Codex app-server 模型列表请求超时".to_string());

    let _ = child.kill();
    let _ = child.wait();

    result?
}

fn read_cached_codex_models(command_path: &Path) -> Option<Vec<AiDetectedModel>> {
    let cache = CODEX_MODEL_CACHE.get_or_init(|| Mutex::new(None));
    let guard = cache.lock().ok()?;
    let cached = guard.as_ref()?;

    if cached.command_path == command_path && cached.loaded_at.elapsed() < CODEX_MODEL_CACHE_TTL {
        return Some(cached.models.clone());
    }

    None
}

fn write_cached_codex_models(command_path: &Path, models: &[AiDetectedModel]) {
    let cache = CODEX_MODEL_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(CachedCodexModels {
            command_path: command_path.to_path_buf(),
            loaded_at: Instant::now(),
            models: models.to_vec(),
        });
    }
}

fn write_codex_model_list_requests(stdin: &mut impl Write) -> Result<(), String> {
    writeln!(
        stdin,
        r#"{{"id":1,"method":"initialize","params":{{"clientInfo":{{"name":"madora","title":"Madora","version":"0.1.0"}},"capabilities":{{"experimentalApi":true,"optOutNotificationMethods":[]}}}}}}"#
    )
    .map_err(|_| "无法初始化 Codex app-server".to_string())?;
    writeln!(stdin, r#"{{"method":"initialized"}}"#)
        .map_err(|_| "无法初始化 Codex app-server".to_string())?;
    writeln!(stdin, r#"{{"id":2,"method":"model/list","params":{{}}}}"#)
        .map_err(|_| "无法请求 Codex 模型列表".to_string())?;
    stdin
        .flush()
        .map_err(|_| "无法刷新 Codex app-server 请求".to_string())
}

fn read_codex_model_list_response(reader: impl BufRead) -> Result<Vec<AiDetectedModel>, String> {
    let mut line_count = 0usize;

    for line in reader.lines() {
        let line = line.map_err(|_| "无法读取 Codex 模型列表".to_string())?;
        line_count += 1;
        let line = line.trim();

        if line.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        if value.get("id").and_then(|id| id.as_i64()) != Some(2) {
            continue;
        }

        if let Some(error) = value.get("error") {
            let message = error
                .get("message")
                .and_then(|message| message.as_str())
                .unwrap_or("未知 JSON-RPC 错误");
            return Err(format!("Codex 模型列表请求失败: {message}"));
        }

        let Some(data) = value
            .get("result")
            .and_then(|result| result.get("data"))
            .and_then(|data| data.as_array())
        else {
            return Err("Codex 模型列表响应格式无效".to_string());
        };

        return Ok(data
            .iter()
            .filter_map(|model| {
                if model
                    .get("hidden")
                    .and_then(|hidden| hidden.as_bool())
                    .unwrap_or(false)
                {
                    return None;
                }

                let id = model
                    .get("model")
                    .and_then(|id| id.as_str())
                    .or_else(|| model.get("id").and_then(|id| id.as_str()))?;
                let label = model
                    .get("displayName")
                    .and_then(|label| label.as_str())
                    .unwrap_or(id);

                Some(AiDetectedModel {
                    available: true,
                    id: id.to_string(),
                    label: label.to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                })
            })
            .collect());
    }

    Err(format!(
        "Codex 未返回模型列表，已读取 {line_count} 行 app-server 输出"
    ))
}

#[cfg(test)]
fn parse_codex_model_list_response(output: &str) -> Result<Vec<AiDetectedModel>, String> {
    read_codex_model_list_response(BufReader::new(output.as_bytes()))
}

fn codex_model_list_diagnostic(command_path: &Path) -> Option<String> {
    let version = run_command_output(command_path, &["--version"])
        .map(|output| format!("version={output}"))
        .unwrap_or_else(|| "version=unknown".to_string());
    let bundled_models = run_command_output(command_path, &["debug", "models", "--bundled"])
        .map(|output| {
            let count = output
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count();
            format!("debug models --bundled 返回 {count} 行")
        })
        .unwrap_or_else(|| "debug models --bundled 不可用".to_string());

    Some(format!("{version}，{bundled_models}"))
}

fn start_codex_actor(
    app: &AppHandle,
    root: &Path,
    session_id: &str,
) -> Result<CodexSessionActor, String> {
    let accounts = detect_ai_accounts_raw();
    let account = accounts
        .iter()
        .find(|account| account.id == "codex" && account.status == "connected")
        .ok_or_else(|| "Codex 本地助手不可用".to_string())?;
    let command_path = account
        .command_path
        .as_deref()
        .ok_or_else(|| "Codex 命令不可用".to_string())?;

    let mut child = Command::new(command_path)
        .args(["app-server", "-c", "service_tier=\"fast\""])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 Codex app-server: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 Codex app-server".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Codex app-server".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 Codex app-server 诊断输出".to_string())?;
    let (sender, receiver) = mpsc::channel();
    let actor = CodexSessionActor {
        sender: sender.clone(),
    };
    let app = app.clone();
    let root_path = root.to_string_lossy().to_string();
    let session_id = session_id.to_string();

    std::thread::spawn(move || {
        run_codex_actor(
            app, session_id, root_path, child, stdin, stdout, stderr, receiver,
        );
    });

    Ok(actor)
}

fn run_codex_actor(
    app: AppHandle,
    session_id: String,
    root_path: String,
    mut child: Child,
    mut stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: ChildStderr,
    receiver: mpsc::Receiver<CodexActorCommand>,
) {
    let (message_sender, message_receiver) = mpsc::channel::<serde_json::Value>();
    start_codex_stdout_reader(stdout, message_sender);
    start_codex_stderr_reader(app.clone(), session_id.clone(), stderr);

    if let Err(error) = write_codex_startup(&mut stdin, &root_path) {
        emit_codex_actor_error(&app, &session_id, error);
        let _ = child.kill();
        let _ = child.wait();
        return;
    }

    let mut thread_id: Option<String> = None;
    let mut next_id = 3u64;
    let mut pending_prompts: VecDeque<String> = VecDeque::new();
    let mut running = true;

    while running {
        while let Ok(message) = message_receiver.try_recv() {
            handle_codex_actor_message(
                &app,
                &session_id,
                &mut stdin,
                &mut thread_id,
                &mut next_id,
                &mut pending_prompts,
                message,
            );
        }

        match receiver.recv_timeout(Duration::from_millis(50)) {
            Ok(CodexActorCommand::SendPrompt { prompt }) => {
                if let Some(thread_id) = thread_id.as_deref() {
                    if let Err(error) =
                        write_codex_turn_start(&mut stdin, &mut next_id, thread_id, &prompt)
                    {
                        emit_codex_actor_error(&app, &session_id, error);
                    }
                } else {
                    pending_prompts.push_back(prompt);
                }
            }
            Ok(CodexActorCommand::Interrupt) => {
                if let Some(thread_id) = thread_id.as_deref() {
                    if let Err(error) =
                        write_codex_turn_interrupt(&mut stdin, &mut next_id, thread_id)
                    {
                        emit_codex_actor_error(&app, &session_id, error);
                    }
                }
            }
            Ok(CodexActorCommand::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                running = false;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }

    let _ = child.kill();
    let _ = child.wait();
}

fn start_codex_stdout_reader(stdout: ChildStdout, sender: mpsc::Sender<serde_json::Value>) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else {
                break;
            };
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
                continue;
            };
            if sender.send(value).is_err() {
                break;
            }
        }
    });
}

fn start_codex_stderr_reader(app: AppHandle, session_id: String, stderr: ChildStderr) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else {
                break;
            };
            if line.contains("\"level\":\"ERROR\"") || line.contains("ERROR") {
                emit_codex_actor_error(&app, &session_id, line);
            }
        }
    });
}

fn handle_codex_actor_message(
    app: &AppHandle,
    session_id: &str,
    stdin: &mut ChildStdin,
    thread_id: &mut Option<String>,
    next_id: &mut u64,
    pending_prompts: &mut VecDeque<String>,
    message: serde_json::Value,
) {
    if message.get("id").and_then(|id| id.as_u64()) == Some(2) {
        if let Some(error) = message
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(|message| message.as_str())
        {
            emit_codex_actor_error(app, session_id, error.to_string());
            return;
        }

        if let Some(id) = message
            .get("result")
            .and_then(|result| result.get("thread"))
            .and_then(|thread| thread.get("id"))
            .and_then(|id| id.as_str())
        {
            *thread_id = Some(id.to_string());
            flush_pending_codex_prompts(
                app,
                session_id,
                stdin,
                thread_id,
                next_id,
                pending_prompts,
            );
        }
    }

    if message.get("method").and_then(|method| method.as_str()) == Some("thread/started") {
        if let Some(id) = message
            .get("params")
            .and_then(|params| params.get("thread"))
            .and_then(|thread| thread.get("id"))
            .and_then(|id| id.as_str())
        {
            *thread_id = Some(id.to_string());
            flush_pending_codex_prompts(
                app,
                session_id,
                stdin,
                thread_id,
                next_id,
                pending_prompts,
            );
        }
    }

    if let Some(error) = message
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
    {
        emit_codex_actor_error(app, session_id, error.to_string());
    }

    for event in map_codex_message_to_runtime_events(session_id, &message) {
        emit_ai_event(app, event);
    }
}

fn flush_pending_codex_prompts(
    app: &AppHandle,
    session_id: &str,
    stdin: &mut ChildStdin,
    thread_id: &Option<String>,
    next_id: &mut u64,
    pending_prompts: &mut VecDeque<String>,
) {
    let Some(thread_id) = thread_id.as_deref() else {
        return;
    };

    while let Some(prompt) = pending_prompts.pop_front() {
        if let Err(error) = write_codex_turn_start(stdin, next_id, thread_id, &prompt) {
            emit_codex_actor_error(app, session_id, error);
            break;
        }
    }
}

fn write_codex_startup(stdin: &mut ChildStdin, root_path: &str) -> Result<(), String> {
    write_json_line(
        stdin,
        serde_json::json!({
            "id": 1,
            "method": "initialize",
            "params": {
                "clientInfo": {
                    "name": "madora",
                    "title": "Madora",
                    "version": "0.1.0"
                },
                "capabilities": {
                    "experimentalApi": true,
                    "optOutNotificationMethods": []
                }
            }
        }),
    )?;
    write_json_line(stdin, serde_json::json!({ "method": "initialized" }))?;
    write_json_line(
        stdin,
        serde_json::json!({
            "id": 2,
            "method": "thread/start",
            "params": {
                "cwd": root_path,
                "approvalPolicy": "never",
                "sandbox": "read-only"
            }
        }),
    )
}

fn write_codex_turn_start(
    stdin: &mut ChildStdin,
    next_id: &mut u64,
    thread_id: &str,
    prompt: &str,
) -> Result<(), String> {
    let id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        serde_json::json!({
            "id": id,
            "method": "turn/start",
            "params": {
                "threadId": thread_id,
                "input": [
                    {
                        "type": "text",
                        "text": prompt,
                        "text_elements": []
                    }
                ],
                "approvalPolicy": "never",
                "sandboxPolicy": {
                    "type": "readOnly",
                    "networkAccess": false
                }
            }
        }),
    )
}

fn write_codex_turn_interrupt(
    stdin: &mut ChildStdin,
    next_id: &mut u64,
    thread_id: &str,
) -> Result<(), String> {
    let id = *next_id;
    *next_id += 1;

    write_json_line(
        stdin,
        serde_json::json!({
            "id": id,
            "method": "turn/interrupt",
            "params": {
                "threadId": thread_id
            }
        }),
    )
}

fn write_json_line(stdin: &mut impl Write, value: serde_json::Value) -> Result<(), String> {
    let mut line = serde_json::to_string(&value).map_err(|error| error.to_string())?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .map_err(|_| "无法写入 Codex app-server".to_string())?;
    stdin
        .flush()
        .map_err(|_| "无法刷新 Codex app-server 请求".to_string())
}

fn emit_codex_actor_error(app: &AppHandle, session_id: &str, message: String) {
    emit_ai_event(
        app,
        AiRuntimeEvent::RunState {
            error: Some(message.clone()),
            exit_code: None,
            session_id: session_id.to_string(),
            state: "failed".to_string(),
        },
    );
    emit_ai_event(
        app,
        AiRuntimeEvent::Error {
            message,
            session_id: Some(session_id.to_string()),
        },
    );
}

fn map_codex_message_to_runtime_events(
    session_id: &str,
    value: &serde_json::Value,
) -> Vec<AiRuntimeEvent> {
    let Some(method) = value.get("method").and_then(|method| method.as_str()) else {
        return Vec::new();
    };
    let params = value.get("params").unwrap_or(&serde_json::Value::Null);

    match method {
        "item/agentMessage/delta" => {
            let message_id = params
                .get("itemId")
                .and_then(|id| id.as_str())
                .unwrap_or("assistant");
            let delta = params
                .get("delta")
                .and_then(|delta| delta.as_str())
                .unwrap_or_default();

            vec![AiRuntimeEvent::MessageDelta {
                delta: delta.to_string(),
                message_id: message_id.to_string(),
                session_id: session_id.to_string(),
            }]
        }
        "item/reasoning/textDelta" | "item/reasoning/summaryTextDelta" => {
            let message_id = params
                .get("itemId")
                .and_then(|id| id.as_str())
                .unwrap_or("reasoning");
            let delta = params
                .get("delta")
                .and_then(|delta| delta.as_str())
                .unwrap_or_default();

            vec![AiRuntimeEvent::ThinkingDelta {
                delta: delta.to_string(),
                message_id: message_id.to_string(),
                parent_tool_call_id: None,
                session_id: session_id.to_string(),
            }]
        }
        "turn/started" => vec![AiRuntimeEvent::RunState {
            error: None,
            exit_code: None,
            session_id: session_id.to_string(),
            state: "running".to_string(),
        }],
        "turn/completed" => vec![
            AiRuntimeEvent::RunState {
                error: None,
                exit_code: None,
                session_id: session_id.to_string(),
                state: "completed".to_string(),
            },
            AiRuntimeEvent::TurnCompleted {
                cancelled: false,
                session_id: session_id.to_string(),
            },
        ],
        "thread/tokenUsage/updated" => {
            let total = params
                .get("tokenUsage")
                .and_then(|usage| usage.get("total"))
                .unwrap_or(&serde_json::Value::Null);

            vec![AiRuntimeEvent::UsageUpdated {
                cache_read_tokens: total
                    .get("cachedInputTokens")
                    .and_then(|tokens| tokens.as_u64()),
                cache_write_tokens: None,
                input_tokens: total
                    .get("inputTokens")
                    .and_then(|tokens| tokens.as_u64())
                    .unwrap_or(0),
                model: None,
                output_tokens: total
                    .get("outputTokens")
                    .and_then(|tokens| tokens.as_u64())
                    .unwrap_or(0),
                session_id: session_id.to_string(),
                total_cost_usd: None,
            }]
        }
        "item/started" => params
            .get("item")
            .and_then(|item| codex_tool_started_event(session_id, item))
            .into_iter()
            .collect(),
        "item/completed" => params
            .get("item")
            .and_then(|item| codex_tool_completed_event(session_id, item))
            .into_iter()
            .collect(),
        "item/commandExecution/requestApproval" | "execCommandApproval" => {
            codex_permission_prompt_event(session_id, value, "Bash")
                .into_iter()
                .collect()
        }
        "item/fileChange/requestApproval" | "applyPatchApproval" => {
            codex_permission_prompt_event(session_id, value, "Edit")
                .into_iter()
                .collect()
        }
        "item/permissions/requestApproval" => {
            codex_permission_prompt_event(session_id, value, "Bash")
                .into_iter()
                .collect()
        }
        "error" => {
            let message = params
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(|message| message.as_str())
                .or_else(|| params.get("message").and_then(|message| message.as_str()))
                .unwrap_or("Codex app-server 错误");

            vec![
                AiRuntimeEvent::RunState {
                    error: Some(message.to_string()),
                    exit_code: None,
                    session_id: session_id.to_string(),
                    state: "failed".to_string(),
                },
                AiRuntimeEvent::Error {
                    message: message.to_string(),
                    session_id: Some(session_id.to_string()),
                },
            ]
        }
        _ => Vec::new(),
    }
}

fn codex_permission_prompt_event(
    session_id: &str,
    value: &serde_json::Value,
    tool_name: &str,
) -> Option<AiRuntimeEvent> {
    let params = value.get("params").unwrap_or(&serde_json::Value::Null);
    let request_id = codex_request_id(value)?;
    let tool_call_id = params
        .get("itemId")
        .and_then(|id| id.as_str())
        .unwrap_or(&request_id)
        .to_string();
    let reason = params
        .get("reason")
        .and_then(|reason| reason.as_str())
        .unwrap_or("需要用户确认")
        .to_string();
    let mut input = serde_json::Map::new();

    for key in [
        "command",
        "cwd",
        "changes",
        "grantRoot",
        "permissions",
        "environmentId",
        "commandActions",
        "proposedExecpolicyAmendment",
        "proposedNetworkPolicyAmendments",
    ] {
        if let Some(value) = params.get(key) {
            input.insert(key.to_string(), value.clone());
        }
    }

    if input.is_empty() {
        input.insert("request".to_string(), params.clone());
    }

    Some(AiRuntimeEvent::PermissionPrompt {
        parent_tool_call_id: None,
        reason,
        request_id,
        session_id: session_id.to_string(),
        suggestions: None,
        tool_call_id,
        tool_input: serde_json::Value::Object(input),
        tool_name: tool_name.to_string(),
    })
}

fn codex_request_id(value: &serde_json::Value) -> Option<String> {
    match value.get("id")? {
        serde_json::Value::String(id) => Some(id.clone()),
        serde_json::Value::Number(id) => Some(id.to_string()),
        other => Some(other.to_string()),
    }
}

fn codex_tool_started_event(session_id: &str, item: &serde_json::Value) -> Option<AiRuntimeEvent> {
    let tool_call_id = item.get("id").and_then(|id| id.as_str())?.to_string();
    let (tool_name, input) = codex_tool_name_and_input(item)?;

    Some(AiRuntimeEvent::ToolStarted {
        input,
        parent_tool_call_id: None,
        session_id: session_id.to_string(),
        tool_call_id,
        tool_name,
    })
}

fn codex_tool_completed_event(
    session_id: &str,
    item: &serde_json::Value,
) -> Option<AiRuntimeEvent> {
    let tool_call_id = item.get("id").and_then(|id| id.as_str())?.to_string();
    let (tool_name, _) = codex_tool_name_and_input(item)?;
    let status = codex_tool_status(item);

    Some(AiRuntimeEvent::ToolCompleted {
        duration_ms: item
            .get("durationMs")
            .and_then(|duration| duration.as_u64()),
        output: codex_tool_output(item),
        parent_tool_call_id: None,
        session_id: session_id.to_string(),
        status,
        tool_call_id,
        tool_name,
    })
}

fn codex_tool_name_and_input(item: &serde_json::Value) -> Option<(String, serde_json::Value)> {
    match item.get("type").and_then(|kind| kind.as_str())? {
        "commandExecution" => Some((
            "Bash".to_string(),
            serde_json::json!({
                "command": item.get("command").cloned().unwrap_or(serde_json::Value::Null),
                "cwd": item.get("cwd").cloned().unwrap_or(serde_json::Value::Null),
            }),
        )),
        "fileChange" => Some((
            "Edit".to_string(),
            serde_json::json!({
                "changes": item.get("changes").cloned().unwrap_or(serde_json::Value::Null),
            }),
        )),
        "mcpToolCall" => {
            let server = item
                .get("server")
                .and_then(|value| value.as_str())
                .unwrap_or("mcp");
            let tool = item
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            Some((
                format!("{server}.{tool}"),
                item.get("arguments")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            ))
        }
        "dynamicToolCall" => {
            let namespace = item
                .get("namespace")
                .and_then(|value| value.as_str())
                .unwrap_or("tool");
            let tool = item
                .get("tool")
                .and_then(|value| value.as_str())
                .unwrap_or("call");
            Some((
                format!("{namespace}.{tool}"),
                item.get("arguments")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            ))
        }
        _ => None,
    }
}

fn codex_tool_status(item: &serde_json::Value) -> String {
    match item.get("status").and_then(|status| status.as_str()) {
        Some("completed") => "success",
        Some("failed") => "error",
        Some("declined") => "denied",
        Some("inProgress") => "running",
        Some("success") => "success",
        Some("error") => "error",
        Some("denied") => "denied",
        _ => "success",
    }
    .to_string()
}

fn codex_tool_output(item: &serde_json::Value) -> serde_json::Value {
    match item.get("type").and_then(|kind| kind.as_str()) {
        Some("commandExecution") => serde_json::json!({
            "aggregatedOutput": item.get("aggregatedOutput").cloned().unwrap_or(serde_json::Value::Null),
            "exitCode": item.get("exitCode").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("fileChange") => serde_json::json!({
            "changes": item.get("changes").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("mcpToolCall") => serde_json::json!({
            "result": item.get("result").cloned().unwrap_or(serde_json::Value::Null),
            "error": item.get("error").cloned().unwrap_or(serde_json::Value::Null),
        }),
        Some("dynamicToolCall") => serde_json::json!({
            "contentItems": item.get("contentItems").cloned().unwrap_or(serde_json::Value::Null),
            "success": item.get("success").cloned().unwrap_or(serde_json::Value::Null),
        }),
        _ => item.clone(),
    }
}

fn is_available_detected_profile(profile_id: &str) -> bool {
    detected_model_profiles(&detect_ai_accounts_raw())
        .iter()
        .any(|profile| profile.id == profile_id && profile.detection.status == "available")
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

fn build_runtime_response(
    session: &AiSessionInfo,
    input: &SendAiPromptInput,
) -> Result<String, String> {
    match session.profile_id.as_str() {
        "fake-echo" => Ok(build_fake_response(input)),
        "codex:local" => run_detected_assistant("codex", &session.root_path, input),
        "claude:local" => run_detected_assistant("claude", &session.root_path, input),
        _ => Err("AI agent profile 不可用".to_string()),
    }
}

fn run_detected_assistant(
    assistant_id: &str,
    root_path: &str,
    input: &SendAiPromptInput,
) -> Result<String, String> {
    let accounts = detect_ai_accounts_raw();
    let account = accounts
        .iter()
        .find(|account| account.id == assistant_id && account.status == "connected")
        .ok_or_else(|| "本地 AI 助手不可用".to_string())?;
    let command_path = account
        .command_path
        .as_deref()
        .ok_or_else(|| "本地 AI 助手命令不可用".to_string())?;
    let prompt = build_assistant_prompt(input);
    let root = validate_agent_root(root_path)?;
    let root_arg = root.to_string_lossy().to_string();

    match assistant_id {
        "codex" => run_command_text(
            Path::new(command_path),
            &[
                "exec",
                "--cd",
                &root_arg,
                "--sandbox",
                "read-only",
                "--ask-for-approval",
                "never",
                "--skip-git-repo-check",
                "--ephemeral",
                &prompt,
            ],
        ),
        "claude" => run_command_text(
            Path::new(command_path),
            &[
                "--print",
                "--output-format",
                "stream-json",
                "--permission-mode",
                "dontAsk",
                "--add-dir",
                &root_arg,
                &prompt,
            ],
        )
        .map(|output| parse_claude_stream_json_text(&output)),
        _ => Err("本地 AI 助手不可用".to_string()),
    }
}

fn build_assistant_prompt(input: &SendAiPromptInput) -> String {
    match input.context.document.as_ref() {
        Some(document) => format!(
            "{}\n\n当前 Markdown 文档：{}\n\n```markdown\n{}\n```",
            input.prompt, document.title, document.markdown
        ),
        None => input.prompt.clone(),
    }
}

fn run_command_text(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "无法启动本地 AI 助手".to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(if stderr.is_empty() {
            "本地 AI 助手调用失败".to_string()
        } else {
            stderr
        });
    }

    if stdout.is_empty() {
        Ok(stderr)
    } else {
        Ok(stdout)
    }
}

fn parse_claude_stream_json_text(output: &str) -> String {
    let mut text = String::new();

    for line in output.lines() {
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };

        if let Some(content) = value.get("content").and_then(|content| content.as_str()) {
            text.push_str(content);
        }

        if let Some(message) = value.get("message") {
            if let Some(content) = message
                .get("content")
                .and_then(|content| content.as_array())
            {
                for block in content {
                    if let Some(block_text) = block.get("text").and_then(|text| text.as_str()) {
                        text.push_str(block_text);
                    }
                }
            }
        }
    }

    if text.trim().is_empty() {
        output.trim().to_string()
    } else {
        text
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
                exec_supported: true,
                stream_json_supported: false,
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection {
                app_server_supported: false,
                command_path: Some(PathBuf::from("/usr/local/bin/claude")),
                exec_supported: false,
                stream_json_supported: true,
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
        assert_eq!(codex.provider_id, "codex");
        assert_eq!(claude.status, "connected");
        assert_eq!(claude.transport.as_deref(), Some("stream-json"));
        assert!(codex.models.is_empty());
        assert!(claude.models.is_empty());
    }

    #[test]
    fn detected_model_profiles_are_available_when_call_bridge_exists() {
        let accounts = build_detected_accounts(
            CommandDetection {
                app_server_supported: true,
                command_path: Some(PathBuf::from("/usr/local/bin/codex")),
                exec_supported: true,
                stream_json_supported: false,
                version: Some("codex-cli 0.130.0".to_string()),
            },
            CommandDetection::default(),
        );
        let profiles = detected_model_profiles(&accounts);

        let profile = profiles
            .iter()
            .find(|profile| profile.id == "codex:local")
            .expect("codex model profile should be generated");

        assert_eq!(profile.kind, "codex_app_server");
        assert_eq!(profile.provider_label, "Codex");
        assert_eq!(profile.detection.status, "available");
        assert!(!profile.is_test_runtime);
    }

    #[test]
    fn parses_codex_model_list_response_without_hardcoded_names() {
        let output = r#"{"id":2,"result":{"data":[{"id":"gpt-5.4","model":"gpt-5.4","displayName":"GPT-5.4","hidden":false},{"id":"gpt-5.5","model":"gpt-5.5","displayName":"GPT-5.5","hidden":false}],"nextCursor":null}}"#;
        let models = parse_codex_model_list_response(output).expect("model list should parse");

        assert_eq!(
            models,
            vec![
                AiDetectedModel {
                    available: true,
                    id: "gpt-5.4".to_string(),
                    label: "GPT-5.4".to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                },
                AiDetectedModel {
                    available: true,
                    id: "gpt-5.5".to_string(),
                    label: "GPT-5.5".to_string(),
                    profile_id: "codex:local".to_string(),
                    provider_id: "codex".to_string(),
                    provider_label: "Codex".to_string(),
                },
            ]
        );
    }

    #[test]
    fn parses_codex_model_list_uses_model_field_and_filters_hidden() {
        let output = r#"{"method":"remoteControl/status/changed","params":{"status":"ready"}}
{"id":1,"result":{"userAgent":"codex-cli"}}
{"id":2,"result":{"data":[{"id":"alias-id","model":"callable-model","displayName":"Callable","hidden":false},{"id":"hidden-id","model":"hidden-model","displayName":"Hidden","hidden":true},{"id":"fallback-id","displayName":"Fallback","hidden":false}],"nextCursor":null}}"#;
        let models = parse_codex_model_list_response(output).expect("model list should parse");

        assert_eq!(
            models
                .iter()
                .map(|model| (model.id.as_str(), model.label.as_str()))
                .collect::<Vec<_>>(),
            vec![("callable-model", "Callable"), ("fallback-id", "Fallback")]
        );
    }

    #[test]
    fn reports_codex_model_list_json_rpc_error() {
        let output = r#"{"id":2,"error":{"code":-32601,"message":"Method not found"}}"#;
        let error = parse_codex_model_list_response(output).expect_err("error should surface");

        assert!(error.contains("Method not found"));
    }

    #[test]
    fn serializes_structured_runtime_events_for_frontend() {
        let tool_event = serde_json::to_value(AiRuntimeEvent::ToolStarted {
            input: serde_json::json!({"command": "pnpm test"}),
            parent_tool_call_id: None,
            session_id: "ai-1".to_string(),
            tool_call_id: "tool-1".to_string(),
            tool_name: "Bash".to_string(),
        })
        .expect("tool event should serialize");
        let usage_event = serde_json::to_value(AiRuntimeEvent::UsageUpdated {
            cache_read_tokens: Some(3),
            cache_write_tokens: Some(4),
            input_tokens: 10,
            model: Some("gpt-5.5".to_string()),
            output_tokens: 20,
            session_id: "ai-1".to_string(),
            total_cost_usd: Some(0.0),
        })
        .expect("usage event should serialize");

        assert_eq!(tool_event["type"], "toolStarted");
        assert_eq!(tool_event["sessionId"], "ai-1");
        assert_eq!(tool_event["toolCallId"], "tool-1");
        assert_eq!(tool_event["toolName"], "Bash");
        assert_eq!(tool_event["input"]["command"], "pnpm test");
        assert_eq!(usage_event["type"], "usageUpdated");
        assert_eq!(usage_event["inputTokens"], 10);
        assert_eq!(usage_event["cacheReadTokens"], 3);
        assert_eq!(usage_event["totalCostUsd"], 0.0);
    }

    #[test]
    fn maps_codex_notifications_to_runtime_events() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "item/agentMessage/delta",
                "params": {
                    "itemId": "msg-1",
                    "delta": "hello"
                }
            }),
        );
        let tool_events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "item/started",
                "params": {
                    "item": {
                        "type": "commandExecution",
                        "id": "cmd-1",
                        "command": "pnpm test",
                        "cwd": "/repo",
                        "status": "inProgress"
                    }
                }
            }),
        );
        let usage_events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "thread/tokenUsage/updated",
                "params": {
                    "tokenUsage": {
                        "total": {
                            "inputTokens": 10,
                            "outputTokens": 20,
                            "cachedInputTokens": 3
                        }
                    }
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::MessageDelta {
                session_id,
                message_id,
                delta
            }) if session_id == "ai-1" && message_id == "msg-1" && delta == "hello"
        ));
        assert!(matches!(
            tool_events.first(),
            Some(AiRuntimeEvent::ToolStarted {
                tool_call_id,
                tool_name,
                input,
                ..
            }) if tool_call_id == "cmd-1"
                && tool_name == "Bash"
                && input.get("command").and_then(|value| value.as_str()) == Some("pnpm test")
        ));
        assert!(matches!(
            usage_events.first(),
            Some(AiRuntimeEvent::UsageUpdated {
                input_tokens: 10,
                output_tokens: 20,
                cache_read_tokens: Some(3),
                ..
            })
        ));
    }

    #[test]
    fn maps_codex_approval_requests_to_permission_prompts() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "id": 42,
                "method": "item/commandExecution/requestApproval",
                "params": {
                    "itemId": "cmd-1",
                    "reason": "needs write access",
                    "command": "echo hi > out.txt",
                    "cwd": "/repo"
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::PermissionPrompt {
                request_id,
                tool_call_id,
                tool_name,
                tool_input,
                reason,
                ..
            }) if request_id == "42"
                && tool_call_id == "cmd-1"
                && tool_name == "Bash"
                && reason == "needs write access"
                && tool_input.get("command").and_then(|value| value.as_str()) == Some("echo hi > out.txt")
                && tool_input.get("cwd").and_then(|value| value.as_str()) == Some("/repo")
        ));
    }

    #[test]
    fn maps_codex_error_notification_nested_message() {
        let events = map_codex_message_to_runtime_events(
            "ai-1",
            &serde_json::json!({
                "method": "error",
                "params": {
                    "error": {
                        "message": "upstream failed"
                    },
                    "willRetry": false
                }
            }),
        );

        assert!(matches!(
            events.first(),
            Some(AiRuntimeEvent::RunState {
                state,
                error: Some(message),
                ..
            }) if state == "failed" && message == "upstream failed"
        ));
    }

    #[test]
    fn parses_claude_stream_json_text_blocks() {
        let output = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"你好"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"，世界"}]}}"#;

        assert_eq!(parse_claude_stream_json_text(output), "你好，世界");
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
        let session = create_session_info(
            "fake-echo".to_string(),
            temp_dir.path().canonicalize().unwrap(),
        );
        runtime.insert_session(session.clone(), None);

        assert!(runtime.session(&session.session_id).is_some());
        runtime
            .stop_session(&session.session_id)
            .expect("停止 session 失败");
        assert!(runtime.session(&session.session_id).is_none());
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
