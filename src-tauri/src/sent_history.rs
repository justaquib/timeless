use std::{fs, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const HISTORY_FILE: &str = "sent-mail-history.json";
const MAX_SENT_MAIL: usize = 5_000;

static HISTORY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SentMailRecord {
    pub(crate) message_id: String,
    pub(crate) from_email: String,
    pub(crate) recipient_email: String,
    pub(crate) recipient_name: String,
    pub(crate) subject: String,
    pub(crate) sent_at: u64,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(default)]
struct SentMailHistory {
    records: Vec<SentMailRecord>,
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(HISTORY_FILE))
        .map_err(|error| format!("Could not access sent-mail history storage: {error}"))
}

fn load_history(path: &PathBuf) -> Result<SentMailHistory, String> {
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Stored sent-mail history is invalid: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(SentMailHistory::default())
        }
        Err(error) => Err(format!("Could not read sent-mail history: {error}")),
    }
}

fn save_history(path: &PathBuf, history: &SentMailHistory) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Sent-mail history location is invalid.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create sent-mail history storage: {error}"))?;
    let contents = serde_json::to_vec(history)
        .map_err(|error| format!("Could not serialize sent-mail history: {error}"))?;
    let temporary_path = path.with_extension("tmp");
    fs::write(&temporary_path, contents)
        .map_err(|error| format!("Could not save sent-mail history: {error}"))?;
    #[cfg(windows)]
    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Could not update sent-mail history: {error}"))?;
    }
    fs::rename(&temporary_path, path)
        .map_err(|error| format!("Could not update sent-mail history: {error}"))
}

fn is_timeless_message_id(message_id: &str) -> bool {
    message_id
        .trim()
        .trim_matches(|character| character == '<' || character == '>')
        .to_ascii_lowercase()
        .starts_with("timeless-")
}

fn merge_record(history: &mut SentMailHistory, record: SentMailRecord) -> bool {
    if !is_timeless_message_id(&record.message_id)
        || history
            .records
            .iter()
            .any(|existing| existing.message_id == record.message_id)
    {
        return false;
    }

    history.records.push(record);
    history
        .records
        .sort_by(|left, right| right.sent_at.cmp(&left.sent_at));
    history.records.truncate(MAX_SENT_MAIL);
    true
}

pub(crate) fn record_sent_mail(app: &AppHandle, record: SentMailRecord) -> Result<(), String> {
    let _lock = HISTORY_LOCK
        .lock()
        .map_err(|_| "Sent-mail history is temporarily unavailable.".to_string())?;
    let path = history_path(app)?;
    let mut history = load_history(&path)?;
    if merge_record(&mut history, record) {
        save_history(&path, &history)?;
    }
    Ok(())
}

pub(crate) fn merge_sent_mail(
    app: &AppHandle,
    records: Vec<SentMailRecord>,
) -> Result<(Vec<SentMailRecord>, usize), String> {
    let _lock = HISTORY_LOCK
        .lock()
        .map_err(|_| "Sent-mail history is temporarily unavailable.".to_string())?;
    let path = history_path(app)?;
    let mut history = load_history(&path)?;
    let mut added = 0;
    for record in records {
        added += usize::from(merge_record(&mut history, record));
    }
    if added > 0 {
        save_history(&path, &history)?;
    }
    Ok((history.records, added))
}

#[tauri::command]
pub(crate) fn get_sent_mail_history(
    app: AppHandle,
    local_records: Vec<SentMailRecord>,
) -> Result<Vec<SentMailRecord>, String> {
    let (records, _) = merge_sent_mail(&app, local_records)?;
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::{SentMailHistory, SentMailRecord, is_timeless_message_id, merge_record};

    fn record(message_id: &str, sent_at: u64) -> SentMailRecord {
        SentMailRecord {
            message_id: message_id.into(),
            from_email: "sender@example.com".into(),
            recipient_email: "recipient@example.com".into(),
            recipient_name: "Recipient".into(),
            subject: "Hello".into(),
            sent_at,
        }
    }

    #[test]
    fn recognizes_only_timeless_generated_message_ids() {
        assert!(is_timeless_message_id("<Timeless-123@example.com>"));
        assert!(!is_timeless_message_id("<other-123@example.com>"));
    }

    #[test]
    fn history_merge_deduplicates_and_orders_newest_first() {
        let mut history = SentMailHistory::default();
        assert!(merge_record(
            &mut history,
            record("<timeless-old@example.com>", 10)
        ));
        assert!(merge_record(
            &mut history,
            record("<timeless-new@example.com>", 20)
        ));
        assert!(!merge_record(
            &mut history,
            record("<timeless-old@example.com>", 10)
        ));
        assert_eq!(history.records[0].sent_at, 20);
        assert_eq!(history.records.len(), 2);
    }
}
