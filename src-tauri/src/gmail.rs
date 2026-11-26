use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::SmtpSettings;

const PERSONAL_LIMIT: usize = 400;
const WORKSPACE_LIMIT: usize = 1_600;
const ROLLING_WINDOW_SECONDS: u64 = 24 * 60 * 60;
const MIN_SEND_INTERVAL_SECONDS: u64 = 3;
const LEDGER_FILE: &str = "gmail-send-ledger.json";

static SEND_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
struct SendLedger {
    sends_by_account: HashMap<String, Vec<u64>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GmailSendQuota {
    account_type: String,
    daily_limit: usize,
    recipients_last_24_hours: usize,
    remaining: usize,
    minimum_interval_seconds: u64,
    next_send_in_seconds: u64,
    reset_in_seconds: u64,
}

pub(super) struct GmailSendGuard {
    _lock: MutexGuard<'static, ()>,
}

pub(super) fn default_account_type() -> String {
    "personal".into()
}

pub(super) fn is_gmail(settings: &SmtpSettings) -> bool {
    settings.host.trim().eq_ignore_ascii_case("smtp.gmail.com")
}

pub(super) fn validate_account_type(account_type: &str) -> Result<(), String> {
    if matches!(account_type, "personal" | "workspace") {
        Ok(())
    } else {
        Err("Choose a supported Gmail account type.".into())
    }
}

fn daily_limit(account_type: &str) -> Result<usize, String> {
    match account_type {
        "personal" => Ok(PERSONAL_LIMIT),
        "workspace" => Ok(WORKSPACE_LIMIT),
        _ => Err("Choose a supported Gmail account type.".into()),
    }
}

fn ledger_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LEDGER_FILE))
        .map_err(|error| format!("Could not access the app data directory: {error}"))
}

fn load_ledger(path: &PathBuf) -> Result<SendLedger, String> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Stored Gmail send history is invalid: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SendLedger::default()),
        Err(error) => Err(format!("Could not read Gmail send history: {error}")),
    }
}

fn save_ledger(path: &PathBuf, ledger: &SendLedger) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Gmail send history location is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create Gmail send history storage: {error}"))?;
    let serialized = serde_json::to_vec(ledger)
        .map_err(|error| format!("Could not serialize Gmail send history: {error}"))?;
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, serialized)
        .map_err(|error| format!("Could not save Gmail send history: {error}"))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not update Gmail send history: {error}"))?;
    }
    fs::rename(&temporary_path, path)
        .map_err(|error| format!("Could not update Gmail send history: {error}"))
}

fn account_key(settings: &SmtpSettings) -> String {
    settings.username.trim().to_ascii_lowercase()
}

fn now_seconds() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("System clock is before the Unix epoch: {error}"))
}

fn prune_window(timestamps: &mut Vec<u64>, now: u64) {
    timestamps.retain(|timestamp| now.saturating_sub(*timestamp) < ROLLING_WINDOW_SECONDS);
}

fn cooldown_remaining(timestamps: &[u64], now: u64) -> u64 {
    timestamps
        .last()
        .map(|last| {
            last.saturating_add(MIN_SEND_INTERVAL_SECONDS)
                .saturating_sub(now)
        })
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
) -> Result<(), String> {
    if recipient_count == 0 || timestamps.len().saturating_add(recipient_count) > limit {
        return Err(format!(
            "The Timeless Gmail safety limit is {limit} recipients in a rolling 24-hour period. Try again after older sends expire."
        ));
    }
    let cooldown = cooldown_remaining(timestamps, now);
    if cooldown > 0 {
        return Err(format!(
            "Wait {cooldown} more seconds before sending another Gmail message."
        ));
    }
    Ok(())
}

pub(super) fn acquire_send_guard(
    app: &AppHandle,
    settings: &SmtpSettings,
    recipient_count: usize,
) -> Result<Option<GmailSendGuard>, String> {
    if !is_gmail(settings) {
        return Ok(None);
    }

    validate_account_type(&settings.gmail_account_type)?;
    let lock = SEND_LOCK
        .lock()
        .map_err(|_| "Gmail sending safeguards are unavailable.".to_string())?;
    let now = now_seconds()?;
    let path = ledger_path(app)?;
    let mut ledger = load_ledger(&path)?;
    let sends = ledger
        .sends_by_account
        .entry(account_key(settings))
        .or_default();
    prune_window(sends, now);
    let limit = daily_limit(&settings.gmail_account_type)?;
    validate_send_eligibility(sends, limit, now, recipient_count)?;

    for _ in 0..recipient_count {
        sends.push(now);
    }
    save_ledger(&path, &ledger)?;
    Ok(Some(GmailSendGuard { _lock: lock }))
}

pub(super) fn send_quota(app: &AppHandle) -> Result<Option<GmailSendQuota>, String> {
    let settings = match super::stored_settings() {
        Ok(settings) => settings,
        Err(error) if error == "SMTP is not configured yet." => return Ok(None),
        Err(error) => return Err(error),
    };
    if !is_gmail(&settings) {
        return Ok(None);
    }
    validate_account_type(&settings.gmail_account_type)?;

    let _lock = SEND_LOCK
        .lock()
        .map_err(|_| "Gmail sending safeguards are unavailable.".to_string())?;
    let now = now_seconds()?;
    let path = ledger_path(app)?;
    let mut ledger = load_ledger(&path)?;
    let sends = ledger
        .sends_by_account
        .entry(account_key(&settings))
        .or_default();
    prune_window(sends, now);
    let limit = daily_limit(&settings.gmail_account_type)?;
    Ok(Some(GmailSendQuota {
        account_type: settings.gmail_account_type,
        daily_limit: limit,
        recipients_last_24_hours: sends.len(),
        remaining: limit.saturating_sub(sends.len()),
        minimum_interval_seconds: MIN_SEND_INTERVAL_SECONDS,
        next_send_in_seconds: cooldown_remaining(sends, now),
        reset_in_seconds: reset_in_seconds(sends, now),
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        PERSONAL_LIMIT, WORKSPACE_LIMIT, cooldown_remaining, daily_limit, prune_window,
        reset_in_seconds, validate_account_type, validate_send_eligibility,
    };

    #[test]
    fn rolling_window_expires_only_sends_at_least_24_hours_old() {
        let mut timestamps = vec![0, 1, 86_399, 86_400, 86_401];
        prune_window(&mut timestamps, 86_400);
        assert_eq!(timestamps, vec![1, 86_399, 86_400, 86_401]);
    }

    #[test]
    fn account_types_select_conservative_safety_limits() {
        assert_eq!(daily_limit("personal").unwrap(), PERSONAL_LIMIT);
        assert_eq!(daily_limit("workspace").unwrap(), WORKSPACE_LIMIT);
        assert!(daily_limit("unknown").is_err());
        assert!(validate_account_type("personal").is_ok());
        assert!(validate_account_type("workspace").is_ok());
        assert!(validate_account_type("unknown").is_err());
    }

    #[test]
    fn cooldown_is_based_on_last_reserved_attempt() {
        assert_eq!(cooldown_remaining(&[100], 101), 2);
        assert_eq!(cooldown_remaining(&[100], 103), 0);
        assert_eq!(cooldown_remaining(&[], 103), 0);
    }

    #[test]
    fn reset_timer_tracks_the_oldest_recipient_expiry() {
        assert_eq!(reset_in_seconds(&[100, 200], 101), 86_399);
        assert_eq!(reset_in_seconds(&[100], 86_500), 0);
        assert_eq!(reset_in_seconds(&[], 86_500), 0);
    }

    #[test]
    fn safety_cap_rejects_another_send_at_the_limit() {
        assert!(validate_send_eligibility(&[1, 4], 2, 10, 1).is_err());
        assert!(validate_send_eligibility(&[1], 2, 10, 1).is_ok());
        assert!(validate_send_eligibility(&[100], 2, 101, 1).is_err());
    }

    #[test]
    fn safety_cap_counts_to_cc_and_bcc_recipients() {
        assert!(validate_send_eligibility(&[1], 3, 10, 2).is_ok());
        assert!(validate_send_eligibility(&[1], 3, 10, 3).is_err());
        assert!(validate_send_eligibility(&[], 3, 10, 0).is_err());
    }
}
