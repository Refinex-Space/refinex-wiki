use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use tauri::ipc::Channel;

use crate::ai_secret;

const AI_PROVIDER_REQUEST_TIMEOUT_SECS: u64 = 20;
const AI_CHAT_REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderJsonRequest {
    pub headers: HashMap<String, String>,
    pub method: String,
    pub provider_id: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub body: String,
    pub headers: HashMap<String, String>,
    pub provider_id: String,
    pub url: String,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderJsonResponse {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AiChatStreamEvent {
    Chunk { chunk: String },
    Done { status: u16 },
}

#[tauri::command]
pub async fn request_ai_provider_json(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    execute_ai_provider_json_request(request).await
}

#[tauri::command]
pub async fn request_ai_chat(request: AiChatRequest) -> Result<AiProviderJsonResponse, String> {
    execute_ai_chat_request(request).await
}

#[tauri::command]
pub async fn request_ai_chat_stream(
    request: AiChatRequest,
    on_event: Channel<AiChatStreamEvent>,
) -> Result<AiProviderJsonResponse, String> {
    let response = execute_ai_chat_request(request).await?;
    let chunk = response
        .body
        .get("text")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| response.body.to_string());

    if !chunk.is_empty() {
        on_event
            .send(AiChatStreamEvent::Chunk { chunk })
            .map_err(|_| "AI chat stream channel failed".to_string())?;
    }
    on_event
        .send(AiChatStreamEvent::Done {
            status: response.status,
        })
        .map_err(|_| "AI chat stream channel failed".to_string())?;

    Ok(response)
}

async fn execute_ai_provider_json_request(
    request: AiProviderJsonRequest,
) -> Result<AiProviderJsonResponse, String> {
    validate_provider_id(&request.provider_id)?;
    if !request.method.eq_ignore_ascii_case("GET") {
        return Err("Only GET requests are supported for AI provider checks.".to_string());
    }

    let url = validated_http_url(&request.url)?;
    let mut headers = parse_safe_headers(&request.headers)?;
    append_provider_auth_header(&mut headers, &request.provider_id)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_PROVIDER_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|_| "AI provider HTTP client failed".to_string())?;
    let response = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(sanitize_http_error)?;
    let status = response.status().as_u16();
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "AI provider response is not valid JSON".to_string())?;

    Ok(AiProviderJsonResponse { status, body })
}

async fn execute_ai_chat_request(request: AiChatRequest) -> Result<AiProviderJsonResponse, String> {
    validate_provider_id(&request.provider_id)?;
    let url = validated_http_url(&request.url)?;
    let mut headers = parse_safe_headers(&request.headers)?;
    append_provider_auth_header(&mut headers, &request.provider_id)?;
    let body: Value = serde_json::from_str(&request.body)
        .map_err(|_| "AI chat request body is not valid JSON".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(AI_CHAT_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|_| "AI chat HTTP client failed".to_string())?;
    let response = client
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(sanitize_http_error)?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(sanitize_http_error)?;
    let body = serde_json::from_str::<Value>(&text).unwrap_or_else(|_| json!({ "text": text }));

    Ok(AiProviderJsonResponse { status, body })
}

fn validated_http_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "AI request URL is invalid".to_string())?;

    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("AI request URL must use http or https".to_string()),
    }
}

fn parse_safe_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut parsed = HeaderMap::new();

    for (key, value) in headers {
        if is_protected_header_name(key) {
            return Err("AI request headers contain protected auth headers".to_string());
        }
        let header_name = HeaderName::from_str(key)
            .map_err(|_| "AI request header name is invalid".to_string())?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|_| "AI request header value is invalid".to_string())?;

        parsed.insert(header_name, header_value);
    }

    Ok(parsed)
}

fn append_provider_auth_header(headers: &mut HeaderMap, provider_id: &str) -> Result<(), String> {
    let Some(secret) = ai_secret::read_ai_provider_secret(provider_id)? else {
        return Ok(());
    };
    let trimmed = secret.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    match provider_id {
        "anthropic" => {
            headers.insert(
                HeaderName::from_static("x-api-key"),
                HeaderValue::from_str(trimmed)
                    .map_err(|_| "AI provider secret is invalid".to_string())?,
            );
        }
        "google" => {
            headers.insert(
                HeaderName::from_static("x-goog-api-key"),
                HeaderValue::from_str(trimmed)
                    .map_err(|_| "AI provider secret is invalid".to_string())?,
            );
        }
        _ => {
            headers.insert(
                HeaderName::from_static("authorization"),
                HeaderValue::from_str(&format!("Bearer {trimmed}"))
                    .map_err(|_| "AI provider secret is invalid".to_string())?,
            );
        }
    }

    Ok(())
}

#[cfg(test)]
fn take_utf8_text(pending: &mut Vec<u8>, chunk: &[u8]) -> Option<String> {
    pending.extend_from_slice(chunk);
    match std::str::from_utf8(pending) {
        Ok(text) => {
            let text = text.to_string();
            pending.clear();
            Some(text)
        }
        Err(error) if error.valid_up_to() > 0 => {
            let valid_up_to = error.valid_up_to();
            let text = String::from_utf8_lossy(&pending[..valid_up_to]).to_string();
            let remaining = pending[valid_up_to..].to_vec();
            *pending = remaining;
            Some(text)
        }
        Err(_) => None,
    }
}

fn validate_provider_id(provider_id: &str) -> Result<(), String> {
    if provider_id.is_empty()
        || provider_id.len() > 80
        || !provider_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | ':'))
    {
        return Err("AI provider id 不安全".to_string());
    }

    Ok(())
}

fn is_protected_header_name(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "api-key"
            | "apikey"
            | "api_key"
            | "authorization"
            | "token"
            | "x-api-key"
            | "x-goog-api-key"
    )
}

fn sanitize_http_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "AI provider request timed out".to_string()
    } else if error.is_connect() {
        "AI provider connection failed".to_string()
    } else {
        "AI provider request failed".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_only_http_provider_urls() {
        assert!(validated_http_url("https://api.openai.com/v1/models").is_ok());
        assert!(validated_http_url("http://localhost:11434/v1/models").is_ok());
        assert!(validated_http_url("file:///tmp/key").is_err());
        assert!(validated_http_url("ftp://example.com/models").is_err());
    }

    #[test]
    fn rejects_protected_headers_from_frontend_request() {
        let mut headers = std::collections::HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer leak".to_string());

        assert_eq!(
            parse_safe_headers(&headers),
            Err("AI request headers contain protected auth headers".to_string()),
        );
    }

    #[test]
    fn splits_stream_chunks_on_valid_utf8_boundaries() {
        let mut pending = Vec::new();
        assert_eq!(
            take_utf8_text(&mut pending, "你".as_bytes()),
            Some("你".to_string()),
        );
        assert!(pending.is_empty());
    }
}
