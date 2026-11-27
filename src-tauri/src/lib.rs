use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use lettre::{
    SmtpTransport,
    message::{Mailbox, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

mod gmail;
mod gmail_auth;
mod gmail_auth_callback;
mod gmail_replies;
mod crypto;
mod database;
mod mail_limits;
mod mail_sending;
mod web_scraping;

const SMTP_SECRET_NAME: &str = "smtp-settings";
const MAX_ATTACHMENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_ATTACHMENTS: usize = 10;

static ATTACHMENT_ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static MESSAGE_ID_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SmtpSettings {
    host: String,
    port: u16,
    security: String,
    #[serde(default = "gmail::default_account_type")]
    gmail_account_type: String,
    username: String,
    password: String,
    from_name: String,
    from_email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PublicSmtpSettings {
    host: String,
    port: u16,
    security: String,
    gmail_account_type: String,
    provider_family: String,
    username: String,
    from_name: String,
    from_email: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MailAttachment {
    id: String,
    name: String,
    content_type: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MailSendReceipt {
    message_id: String,
    sent_at: u64,
    history_save_error: Option<String>,
}

impl From<&SmtpSettings> for PublicSmtpSettings {
    fn from(settings: &SmtpSettings) -> Self {
        Self {
            host: settings.host.clone(),
            port: settings.port,
            security: settings.security.clone(),
            gmail_account_type: settings.gmail_account_type.clone(),
            provider_family: mail_limits::provider_family(settings).into(),
            username: settings.username.clone(),
            from_name: settings.from_name.clone(),
            from_email: settings.from_email.clone(),
        }
    }
}

fn validate_settings(settings: &SmtpSettings) -> Result<(), String> {
    if settings.host.trim().is_empty() {
        return Err("SMTP host is required.".into());
    }
    if settings.username.trim().is_empty() || settings.password.is_empty() {
        return Err("SMTP username and password are required.".into());
    }
    if settings.from_name.trim().is_empty() {
        return Err("Sender name is required.".into());
    }
    settings
        .from_email
        .parse::<Mailbox>()
        .map_err(|_| "Enter a valid sender email address.".to_string())?;
    if !matches!(settings.security.as_str(), "starttls" | "ssl") {
        return Err("Choose STARTTLS or SSL/TLS encryption.".into());
    }
    if gmail::is_gmail(settings) {
        gmail::validate_account_type(&settings.gmail_account_type)?;
    }
    Ok(())
}

fn stored_settings(app: &AppHandle) -> Result<SmtpSettings, String> {
    match database::read_secret(app, SMTP_SECRET_NAME)? {
        Some(serialized) => serde_json::from_str(&serialized)
            .map_err(|error| format!("Stored SMTP settings are invalid: {error}")),
        None => Err("SMTP is not configured yet.".to_string()),
    }
}

fn build_transport(settings: &SmtpSettings) -> Result<SmtpTransport, String> {
    validate_settings(settings)?;
    let credentials = Credentials::new(settings.username.clone(), settings.password.clone());
    let builder = match settings.security.as_str() {
        "starttls" => SmtpTransport::starttls_relay(&settings.host),
        "ssl" => SmtpTransport::relay(&settings.host),
        _ => return Err("Choose STARTTLS or SSL/TLS encryption.".into()),
    }
    .map_err(|error| format!("Could not configure the SMTP connection: {error}"))?
    .port(settings.port)
    .credentials(credentials)
    .timeout(Some(Duration::from_secs(30)));

    Ok(builder.build())
}

fn attachment_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("attachments"))
        .map_err(|error| format!("Could not access the app data directory: {error}"))
}

fn validate_attachment_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || !id.bytes().all(|byte| byte.is_ascii_digit() || byte == b'-')
        || !id.bytes().any(|byte| byte.is_ascii_digit())
    {
        return Err("Attachment identifier is invalid.".into());
    }
    Ok(())
}

fn validate_attachment_size(size: usize) -> Result<(), String> {
    if size == 0 || size > MAX_ATTACHMENT_BYTES {
        return Err("Attachment must be between 1 byte and 10 MB.".into());
    }
    Ok(())
}

fn safe_attachment_name(name: &str) -> Result<String, String> {
    let name = name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    if name.is_empty() || name == "." || name == ".." || name.chars().any(char::is_control) {
        return Err("Attachment filename is invalid.".into());
    }
    Ok(name.to_string())
}

#[tauri::command]
fn save_template_attachment(
    app: AppHandle,
    name: String,
    content_type: String,
    bytes: Vec<u8>,
) -> Result<MailAttachment, String> {
    validate_attachment_size(bytes.len())?;
    let name = safe_attachment_name(&name)?;
    ContentType::parse(&content_type)
        .map_err(|_| "Attachment content type is invalid.".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not create an attachment identifier: {error}"))?
        .as_nanos();
    let id = format!(
        "{timestamp}-{}",
        ATTACHMENT_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let directory = attachment_directory(&app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create attachment storage: {error}"))?;
    let path = directory.join(&id);
    fs::write(&path, &bytes)
        .map_err(|error| format!("Could not store attachment {name}: {error}"))?;

    Ok(MailAttachment {
        id,
        name,
        content_type,
        size: bytes.len() as u64,
    })
}

#[tauri::command]
fn delete_template_attachment(app: AppHandle, id: String) -> Result<(), String> {
    validate_attachment_id(&id)?;
    let path = attachment_directory(&app)?.join(id);
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not delete the attachment: {error}")),
    }
}

#[tauri::command]
fn get_smtp_settings(app: AppHandle) -> Result<Option<PublicSmtpSettings>, String> {
    match stored_settings(&app) {
        Ok(settings) => Ok(Some(PublicSmtpSettings::from(&settings))),
        Err(error) if error == "SMTP is not configured yet." => Ok(None),
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn get_mail_send_quota(
    app: AppHandle,
    daily_limit: usize,
) -> Result<Option<mail_limits::MailSendQuota>, String> {
    mail_limits::send_quota(&app, daily_limit)
}

#[tauri::command]
fn save_smtp_settings(app: AppHandle, settings: SmtpSettings) -> Result<PublicSmtpSettings, String> {
    validate_settings(&settings)?;
    let serialized = serde_json::to_string(&settings)
        .map_err(|error| format!("Could not serialize SMTP settings: {error}"))?;
    database::write_secret(&app, SMTP_SECRET_NAME, &serialized)?;
    Ok(PublicSmtpSettings::from(&settings))
}

#[tauri::command]
fn test_smtp_connection(settings: SmtpSettings) -> Result<(), String> {
    let transport = build_transport(&settings)?;
    let connected = transport
        .test_connection()
        .map_err(|error| format!("SMTP connection failed: {error}"))?;
    if connected {
        Ok(())
    } else {
        Err("SMTP server did not confirm the connection.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            database::load_workspace_state,
            database::save_workspace_state,
            database::get_sent_mail_history,
            database::save_scrape_search,
            database::get_scrape_searches,
            database::delete_scrape_search,
            database::get_tasks,
            database::save_task,
            database::delete_task,
            get_smtp_settings,
            get_mail_send_quota,
            gmail_auth::get_gmail_auth_account,
            gmail_auth::start_gmail_oauth,
            gmail_auth::exchange_gmail_oauth_code,
            gmail_auth::disconnect_gmail,
            gmail_replies::get_gmail_reply_count,
            gmail_replies::recover_gmail_sent_mail,
            web_scraping::fetch_scrape_page,
            save_smtp_settings,
            test_smtp_connection,
            save_template_attachment,
            delete_template_attachment,
            mail_sending::send_email
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_ATTACHMENT_BYTES, safe_attachment_name, validate_attachment_id,
        validate_attachment_size,
    };

    #[test]
    fn attachment_id_rejects_path_traversal() {
        assert!(validate_attachment_id("12345-1").is_ok());
        assert!(validate_attachment_id("../outside").is_err());
        assert!(validate_attachment_id("-").is_err());
    }

    #[test]
    fn attachment_name_uses_a_safe_basename() {
        assert_eq!(safe_attachment_name("../report.pdf").unwrap(), "report.pdf");
        assert!(safe_attachment_name("report\r\nBcc: attacker@example.com").is_err());
        assert!(safe_attachment_name("..").is_err());
    }

    #[test]
    fn attachment_size_enforces_empty_and_total_size_limits() {
        assert!(validate_attachment_size(1).is_ok());
        assert!(validate_attachment_size(MAX_ATTACHMENT_BYTES).is_ok());
        assert!(validate_attachment_size(0).is_err());
        assert!(validate_attachment_size(MAX_ATTACHMENT_BYTES + 1).is_err());
    }
}
