use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::{Duration, Instant},
};

use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::database::{delete_secret, read_secret, write_secret};
use crate::gmail_auth_callback::parse_callback_request;

const GMAIL_SECRET_NAME: &str = "gmail-oauth";
const CALLBACK_EVENT: &str = "gmail-oauth-callback";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const PROFILE_URL: &str = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const CLIENT_ID_ERROR: &str = "Google rejected the OAuth client ID. Check the Desktop app client ID in .env.local, restart Timeless, and try again.";
const CLIENT_SECRET_ERROR: &str = "Google requires a client secret for this OAuth client. Set VITE_GOOGLE_CLIENT_SECRET in .env.local using the value from your Desktop app OAuth client, then restart Timeless.";
const GMAIL_API_DISABLED_ERROR: &str = "The Gmail API is disabled for this Google Cloud project. Enable Gmail API in the same project as your OAuth client, then wait a few minutes and retry: https://console.cloud.google.com/apis/library/gmail.googleapis.com";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GmailAuthAccount {
    email: String,
}

#[derive(Deserialize, Serialize)]
struct StoredGmailCredentials {
    email: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
    error_description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailProfile {
    email_address: String,
}

fn stored_credentials(app: &AppHandle) -> Result<Option<StoredGmailCredentials>, String> {
    match read_secret(app, GMAIL_SECRET_NAME)? {
        Some(serialized) => serde_json::from_str(&serialized)
            .map(Some)
            .map_err(|error| format!("Stored Gmail credentials are invalid: {error}")),
        None => Ok(None),
    }
}

fn save_credentials(app: &AppHandle, credentials: &StoredGmailCredentials) -> Result<(), String> {
    let serialized = serde_json::to_string(credentials)
        .map_err(|error| format!("Could not serialize Gmail credentials: {error}"))?;
    write_secret(app, GMAIL_SECRET_NAME, &serialized)
}

fn is_client_id_error(error: &str) -> bool {
    matches!(
        error,
        "invalid_client" | "unauthorized_client" | "deleted_client"
    )
}

fn is_missing_client_secret_error(description: &str) -> bool {
    let description = description.to_ascii_lowercase();
    description.contains("client_secret") && description.contains("missing")
}

fn is_gmail_api_disabled_error(body: &str) -> bool {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    let Some(error) = value.get("error") else {
        return false;
    };
    let reasons = error
        .get("errors")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("reason").and_then(serde_json::Value::as_str));
    let detail_reasons = error
        .get("details")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.get("reason").and_then(serde_json::Value::as_str));
    reasons
        .chain(detail_reasons)
        .any(|reason| matches!(reason, "accessNotConfigured" | "SERVICE_DISABLED"))
}

pub(crate) fn oauth_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Could not configure the Google OAuth connection: {error}"))
}

pub(crate) fn response_json<T: for<'de> Deserialize<'de>>(response: Response) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("Could not read Google’s response: {error}"))?;
    if !status.is_success() {
        if is_gmail_api_disabled_error(&body) {
            return Err(GMAIL_API_DISABLED_ERROR.into());
        }
        let detail = match serde_json::from_str::<TokenError>(&body) {
            Ok(error) if is_client_id_error(&error.error) => return Err(CLIENT_ID_ERROR.into()),
            Ok(error)
                if error
                    .error_description
                    .as_deref()
                    .is_some_and(is_missing_client_secret_error) =>
            {
                return Err(CLIENT_SECRET_ERROR.into());
            }
            Ok(error) => error.error_description.unwrap_or(error.error),
            Err(_) if is_missing_client_secret_error(&body) => {
                return Err(CLIENT_SECRET_ERROR.into());
            }
            Err(_) => body.clone(),
        };
        return Err(format!("Google request failed ({status}): {detail}"));
    }
    serde_json::from_str(&body)
        .map_err(|error| format!("Google returned an invalid response: {error}"))
}

fn fetch_profile(access_token: &str) -> Result<String, String> {
    let response = oauth_client()?
        .get(PROFILE_URL)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("Could not read the Gmail account profile: {error}"))?;
    let profile: GmailProfile = response_json(response)?;
    if profile.email_address.trim().is_empty() {
        return Err("Google did not return an email address for this account.".into());
    }
    Ok(profile.email_address)
}

pub(crate) fn refresh_access_token(app: &AppHandle, client_id: &str, client_secret: &str) -> Result<String, String> {
    let credentials = stored_credentials(app)?
        .ok_or_else(|| "Sign in with Gmail to enable reply tracking.".to_string())?;
    let mut form = vec![
        ("client_id", client_id),
        ("refresh_token", credentials.refresh_token.as_str()),
        ("grant_type", "refresh_token"),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret));
    }
    let response = oauth_client()?
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .map_err(|error| format!("Could not refresh Gmail access: {error}"))?;
    let token: TokenResponse = response_json(response)?;
    if let Some(refresh_token) = token.refresh_token {
        save_credentials(app, &StoredGmailCredentials {
            email: credentials.email,
            refresh_token,
        })?;
    }
    Ok(token.access_token)
}

#[tauri::command]
pub(crate) fn get_gmail_auth_account(app: AppHandle) -> Result<Option<GmailAuthAccount>, String> {
    Ok(stored_credentials(&app)?.map(|credentials| GmailAuthAccount {
        email: credentials.email,
    }))
}

#[tauri::command]
pub(crate) fn start_gmail_oauth(app: AppHandle, state: String) -> Result<u16, String> {
    if state.len() < 32
        || state.len() > 256
        || !state
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("The Gmail sign-in state is invalid.".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Could not open the local Gmail sign-in callback: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not configure the Gmail sign-in callback: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Could not read the Gmail callback port: {error}"))?
        .port();

    thread::Builder::new()
        .name("gmail-oauth-callback".into())
        .spawn(move || wait_for_callback(app, listener, state))
        .map_err(|error| format!("Could not start the Gmail sign-in callback: {error}"))?;
    Ok(port)
}

fn wait_for_callback(app: AppHandle, listener: TcpListener, expected_state: String) {
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut request = [0_u8; 8_192];
                let callback = match stream.read(&mut request) {
                    Ok(size) => parse_callback_request(&String::from_utf8_lossy(&request[..size])),
                    Err(error) => Err(format!("Could not read the Gmail callback: {error}")),
                };
                match callback {
                    Ok(callback) if callback.state == expected_state => {
                        respond_to_browser(
                            &mut stream,
                            callback.error.is_none() && callback.code.is_some(),
                        );
                        if let Err(error) = app.emit(CALLBACK_EVENT, callback) {
                            eprintln!("Could not notify the app about Gmail sign-in: {error}");
                        }
                        return;
                    }
                    Ok(_) => respond_to_browser(&mut stream, false),
                    Err(error) => {
                        respond_to_browser(&mut stream, false);
                        eprintln!("{error}");
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(100));
            }
            Err(error) => {
                eprintln!("Gmail sign-in callback failed: {error}");
                return;
            }
        }
    }
    eprintln!("Gmail sign-in callback timed out.");
}

fn respond_to_browser(stream: &mut TcpStream, success: bool) {
    let body = if success {
        "<!doctype html><title>Timeless</title><p>Sign-in complete. Return to Timeless.</p>"
    } else {
        "<!doctype html><title>Timeless</title><p>Sign-in callback rejected. Return to Timeless.</p>"
    };
    let response = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        if success { "200" } else { "400" },
        if success { "OK" } else { "Bad Request" },
        body.len(),
        body
    );
    if let Err(error) = stream.write_all(response.as_bytes()) {
        eprintln!("Could not respond to the Gmail sign-in browser: {error}");
    }
}

#[tauri::command]
pub(crate) async fn exchange_gmail_oauth_code(
    app: AppHandle,
    client_id: String,
    client_secret: String,
    code: String,
    verifier: String,
    redirect_uri: String,
) -> Result<GmailAuthAccount, String> {
    tauri::async_runtime::spawn_blocking(move || {
        exchange_gmail_oauth_code_sync(&app, client_id, client_secret, code, verifier, redirect_uri)
    })
    .await
    .map_err(|error| format!("Gmail sign-in task failed: {error}"))?
}

fn exchange_gmail_oauth_code_sync(
    app: &AppHandle,
    client_id: String,
    client_secret: String,
    code: String,
    verifier: String,
    redirect_uri: String,
) -> Result<GmailAuthAccount, String> {
    if code.is_empty() || verifier.len() < 43 {
        return Err("Google returned an invalid authorization code.".into());
    }
    let callback_port = redirect_uri.strip_prefix("http://127.0.0.1:");
    if !callback_port
        .is_some_and(|port| port.parse::<u16>().is_ok_and(|parsed_port| parsed_port > 0))
    {
        return Err("The Gmail sign-in redirect URI is invalid.".into());
    }

    let mut form = vec![
        ("client_id", client_id.as_str()),
        ("code", code.as_str()),
        ("code_verifier", verifier.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if !client_secret.is_empty() {
        form.push(("client_secret", client_secret.as_str()));
    }
    let response = oauth_client()?
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .map_err(|error| format!("Could not exchange the Gmail authorization code: {error}"))?;
    let token: TokenResponse = response_json(response)?;
    let email = fetch_profile(&token.access_token)?;
    let previous = stored_credentials(app)?;
    let refresh_token = match token.refresh_token {
        Some(refresh_token) => refresh_token,
        None => previous
            .filter(|credentials| credentials.email.eq_ignore_ascii_case(&email))
            .map(|credentials| credentials.refresh_token)
            .ok_or_else(|| {
                "Google did not provide offline access. Retry sign-in and approve the requested Gmail access."
                    .to_string()
            })?,
    };
    save_credentials(app, &StoredGmailCredentials {
        email: email.clone(),
        refresh_token,
    })?;
    Ok(GmailAuthAccount { email })
}

#[tauri::command]
pub(crate) fn disconnect_gmail(app: AppHandle) -> Result<(), String> {
    delete_secret(&app, GMAIL_SECRET_NAME)
}

#[cfg(test)]
#[path = "gmail_auth_tests.rs"]
mod tests;
