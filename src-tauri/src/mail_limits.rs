use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{SmtpSettings, gmail, stored_settings};

const ROLLING_WINDOW_SECONDS: u64 = 24 * 60 * 60;
const MIN_GMAIL_SEND_INTERVAL_SECONDS: u64 = 3;
const MAX_DAILY_LIMIT: usize = 10_000;
const LEDGER_FILE: &str = "gmail-send-ledger.json";

static SEND_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
struct SendLedger {
    sends_by_account: HashMap<String, Vec<u64>>,
    sends_by_provider_account: HashMap<String, Vec<u64>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MailSendQuota {
    provider_family: String,
    daily_limit: usize,
    recipients_last_24_hours: usize,
    remaining: usize,
    minimum_interval_seconds: u64,
    next_send_in_seconds: u64,
    reset_in_seconds: u64,
}

pub(crate) struct MailSendGuard {
    _lock: MutexGuard<'static, ()>,
}

pub(crate) fn provider_family(settings: &SmtpSettings) -> &'static str {
    provider_family_for_host(&settings.host)
}

fn provider_family_for_host(host: &str) -> &'static str {
    let host = host.trim().to_ascii_lowercase();
    if host == "smtp.gmail.com" {
        "gmail"
    } else if host.contains("zoho") {
        "zoho"
    } else if host == "smtp.office365.com" || host.ends_with(".office365.com") {
        "microsoft365"
    } else if host.contains("outlook") || host.contains("hotmail") || host.contains("live.com") {
        "outlook"
    } else {
        "custom"
    }
}

pub(crate) fn provider_label(family: &str) -> &'static str {
    match family {
        "gmail" => "Gmail",
        "zoho" => "Zoho Mail",
        "outlook" => "Outlook.com",
        "microsoft365" => "Microsoft 365",
        _ => "custom SMTP",
    }
}

pub(crate) fn validate_daily_limit(limit: usize) -> Result<(), String> {
    if (1..=MAX_DAILY_LIMIT).contains(&limit) {
        Ok(())
    } else {
        Err(format!(
            "Daily recipient limit must be between 1 and {MAX_DAILY_LIMIT}."
        ))
    }
}

fn effective_daily_limit(
    settings: &SmtpSettings,
    configured_limit: usize,
) -> Result<usize, String> {
    validate_daily_limit(configured_limit)?;
    if gmail::is_gmail(settings) {
        gmail::validate_account_type(&settings.gmail_account_type)?;
        Ok(configured_limit.min(gmail::daily_limit(&settings.gmail_account_type)?))
    } else {
        Ok(configured_limit)
    }
}

fn ledger_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LEDGER_FILE))
        .map_err(|error| format!("Could not access mail send-limit storage: {error}"))
}

fn load_ledger(path: &PathBuf) -> Result<SendLedger, String> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Stored mail send-limit history is invalid: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SendLedger::default()),
        Err(error) => Err(format!("Could not read mail send-limit history: {error}")),
    }
}

fn save_ledger(path: &PathBuf, ledger: &SendLedger) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Mail send-limit storage location is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create mail send-limit storage: {error}"))?;
    let serialized = serde_json::to_vec(ledger)
        .map_err(|error| format!("Could not serialize mail send-limit history: {error}"))?;
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, serialized)
        .map_err(|error| format!("Could not save mail send-limit history: {error}"))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not update mail send-limit history: {error}"))?;
    }
    fs::rename(&temporary_path, path)
        .map_err(|error| format!("Could not update mail send-limit history: {error}"))
}

fn account_key(settings: &SmtpSettings) -> String {
    settings.username.trim().to_ascii_lowercase()
}

fn provider_account_key(settings: &SmtpSettings) -> String {
    format!("{}:{}", provider_family(settings), account_key(settings))
}

fn sends_for_provider_mut<'a>(
    ledger: &'a mut SendLedger,
    settings: &SmtpSettings,
) -> &'a mut Vec<u64> {
    if gmail::is_gmail(settings) {
        ledger
            .sends_by_account
            .entry(account_key(settings))
            .or_default()
    } else {
        ledger
            .sends_by_provider_account
            .entry(provider_account_key(settings))
            .or_default()
    }
}

fn now_seconds() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| "System clock is before the Unix epoch.".to_string())
}

fn prune_window(timestamps: &mut Vec<u64>, now: u64) {
    timestamps.retain(|timestamp| now.saturating_sub(*timestamp) < ROLLING_WINDOW_SECONDS);
}

fn cooldown_remaining(timestamps: &[u64], now: u64, minimum_interval: u64) -> u64 {
    if minimum_interval == 0 {
        return 0;
    }
    timestamps
        .last()
        .map(|last| last.saturating_add(minimum_interval).saturating_sub(now))
        .unwrap_or(0)
}

fn reset_in_seconds(timestamps: &[u64], now: u64) -> u64 {
    timestamps
        .iter()
        .min()
        .map(|timestamp| {
            timestamp
                .saturating_add(ROLLING_WINDOW_SECONDS)
                .saturating_sub(now)
        })
        .unwrap_or(0)
}

fn validate_send_eligibility(
    timestamps: &[u64],
    limit: usize,
    now: u64,
    recipient_count: usize,
    provider: &str,
    minimum_interval: u64,
) -> Result<(), String> {
    if recipient_count == 0 || timestamps.len().saturating_add(recipient_count) > limit {
        return Err(format!(
            "The Timeless {provider} limit is {limit} recipient deliveries in a rolling 24-hour window. Try again after older sends expire."
        ));
    }
    let cooldown = cooldown_remaining(timestamps, now, minimum_interval);
    if cooldown > 0 {
        return Err(format!(
            "Wait {cooldown} more seconds before sending another Gmail message."
        ));
    }
    Ok(())
}

pub(crate) fn acquire_send_guard(
    app: &AppHandle,
    settings: &SmtpSettings,
    recipient_count: usize,
    configured_limit: usize,
) -> Result<MailSendGuard, String> {
    let provider = provider_family(settings);
    let limit = effective_daily_limit(settings, configured_limit)?;
    let minimum_interval = if gmail::is_gmail(settings) {
        MIN_GMAIL_SEND_INTERVAL_SECONDS
    } else {
        0
    };
    let lock = SEND_LOCK
        .lock()
        .map_err(|_| "Mail send-limit safeguards are unavailable.".to_string())?;
    let now = now_seconds()?;
    let path = ledger_path(app)?;
    let mut ledger = load_ledger(&path)?;
    let sends = sends_for_provider_mut(&mut ledger, settings);
    prune_window(sends, now);
    validate_send_eligibility(
        sends,
        limit,
        now,
        recipient_count,
        provider_label(provider),
        minimum_interval,
    )?;
    for _ in 0..recipient_count {
        sends.push(now);
    }
    save_ledger(&path, &ledger)?;
    Ok(MailSendGuard { _lock: lock })
}

pub(crate) fn send_quota(
    app: &AppHandle,
    configured_limit: usize,
) -> Result<Option<MailSendQuota>, String> {
    let settings = match stored_settings() {
        Ok(settings) => settings,
        Err(error) if error == "SMTP is not configured yet." => return Ok(None),
        Err(error) => return Err(error),
    };
    let provider = provider_family(&settings);
    let limit = effective_daily_limit(&settings, configured_limit)?;
    let minimum_interval = if gmail::is_gmail(&settings) {
        MIN_GMAIL_SEND_INTERVAL_SECONDS
    } else {
        0
    };
    let _lock = SEND_LOCK
        .lock()
        .map_err(|_| "Mail send-limit safeguards are unavailable.".to_string())?;
    let now = now_seconds()?;
    let path = ledger_path(app)?;
    let mut ledger = load_ledger(&path)?;
    let sends = sends_for_provider_mut(&mut ledger, &settings);
    prune_window(sends, now);
    Ok(Some(MailSendQuota {
        provider_family: provider.into(),
        daily_limit: limit,
        recipients_last_24_hours: sends.len(),
        remaining: limit.saturating_sub(sends.len()),
        minimum_interval_seconds: minimum_interval,
        next_send_in_seconds: cooldown_remaining(sends, now, minimum_interval),
        reset_in_seconds: reset_in_seconds(sends, now),
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_DAILY_LIMIT, cooldown_remaining, effective_daily_limit, provider_family_for_host,
        prune_window, reset_in_seconds, validate_daily_limit, validate_send_eligibility,
    };
    use crate::{SmtpSettings, gmail};

    fn settings(host: &str, account_type: &str) -> SmtpSettings {
        SmtpSettings {
            host: host.into(),
            port: 587,
            security: "starttls".into(),
            gmail_account_type: account_type.into(),
            username: "sender@example.com".into(),
            password: "unused".into(),
            from_name: "Sender".into(),
            from_email: "sender@example.com".into(),
        }
    }

    #[test]
    fn classifies_supported_provider_families() {
        assert_eq!(provider_family_for_host("smtp.gmail.com"), "gmail");
        assert_eq!(provider_family_for_host("smtp.zoho.eu"), "zoho");
        assert_eq!(provider_family_for_host("smtp-mail.outlook.com"), "outlook");
        assert_eq!(
            provider_family_for_host("smtp.office365.com"),
            "microsoft365"
        );
        assert_eq!(provider_family_for_host("mail.example.com"), "custom");
    }

    #[test]
    fn configurable_limit_cannot_exceed_gmail_safety_ceiling() {
        assert_eq!(
            effective_daily_limit(&settings("smtp.gmail.com", "personal"), MAX_DAILY_LIMIT)
                .unwrap(),
            400
        );
        assert_eq!(
            effective_daily_limit(&settings("smtp.gmail.com", "workspace"), 800).unwrap(),
            800
        );
        assert_eq!(
            effective_daily_limit(&settings("smtp.zoho.com", "personal"), 800).unwrap(),
            800
        );
        assert!(effective_daily_limit(&settings("smtp.gmail.com", "other"), 800).is_err());
    }

    #[test]
    fn rolling_window_and_quota_reject_excess_recipient_deliveries() {
        let mut timestamps = vec![0, 1, 86_399, 86_400, 86_401];
        prune_window(&mut timestamps, 86_400);
        assert_eq!(timestamps, vec![1, 86_399, 86_400, 86_401]);
        assert!(validate_send_eligibility(&[1, 4], 2, 10, 1, "Zoho Mail", 0).is_err());
        assert!(validate_send_eligibility(&[1], 3, 10, 2, "Zoho Mail", 0).is_ok());
        assert!(validate_send_eligibility(&[1], 3, 10, 3, "Zoho Mail", 0).is_err());
        assert!(validate_send_eligibility(&[], 3, 10, 0, "Zoho Mail", 0).is_err());
        assert!(validate_send_eligibility(&[100], 2, 101, 1, "Gmail", 3).is_err());
    }

    #[test]
    fn gmail_cooldown_and_oldest_slot_expiry_are_preserved() {
        assert_eq!(cooldown_remaining(&[100], 101, 3), 2);
        assert_eq!(cooldown_remaining(&[100], 103, 3), 0);
        assert_eq!(reset_in_seconds(&[100, 200], 101), 86_399);
        assert_eq!(reset_in_seconds(&[], 86_500), 0);
        assert_eq!(gmail::daily_limit("personal").unwrap(), 400);
    }

    #[test]
    fn daily_limit_validation_rejects_out_of_range_values() {
        assert!(validate_daily_limit(1).is_ok());
        assert!(validate_daily_limit(MAX_DAILY_LIMIT).is_ok());
        assert!(validate_daily_limit(0).is_err());
        assert!(validate_daily_limit(MAX_DAILY_LIMIT + 1).is_err());
    }
}
