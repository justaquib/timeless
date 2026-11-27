use std::{fs, path::PathBuf};

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use tauri::{AppHandle, Manager};

const DATABASE_FILE: &str = "timeless.sqlite3";

pub(crate) fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not access workspace storage: {error}"))?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Could not create workspace storage: {error}"))?;
    let connection = Connection::open(PathBuf::from(path).join(DATABASE_FILE))
        .map_err(|error| format!("Could not open workspace database: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS recipients (
                 id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, data TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS templates (
                 id TEXT PRIMARY KEY, data TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS sent_mail (
                 message_id TEXT PRIMARY KEY, sent_at INTEGER NOT NULL, data TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS sent_mail_sent_at ON sent_mail(sent_at DESC);
             CREATE TABLE IF NOT EXISTS preferences (
                 id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS tasks (
                 id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL,
                 completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS scrape_searches (
                 id TEXT PRIMARY KEY, saved_at INTEGER NOT NULL, data TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS workspace_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )
        .map_err(|error| format!("Could not initialize workspace database: {error}"))?;
    Ok(connection)
}

fn json_text(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("Could not serialize workspace data: {error}"))
}

pub(crate) fn save_persisted_state(
    app: &AppHandle,
    key: &str,
    serialized: &str,
) -> Result<(), String> {
    let connection = open(app)?;
    let document: Value = serde_json::from_str(serialized)
        .map_err(|error| format!("Workspace data is invalid: {error}"))?;
    let state = document.get("state").unwrap_or(&document);
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("Could not begin workspace save: {error}"))?;

    match key {
        "timeless-mailer" | "postbird-mailer" => {
            let recipients = state.get("recipients").and_then(Value::as_array).cloned().unwrap_or_default();
            let templates = state.get("templates").and_then(Value::as_array).cloned().unwrap_or_default();
            let sent_mail = state.get("sentMail").and_then(Value::as_array).cloned().unwrap_or_default();
            transaction.execute("DELETE FROM recipients", []).map_err(|error| error.to_string())?;
            transaction.execute("DELETE FROM templates", []).map_err(|error| error.to_string())?;
            for recipient in recipients {
                let id = recipient.get("id").and_then(Value::as_str).unwrap_or_default();
                let email = recipient.get("email").and_then(Value::as_str).unwrap_or_default();
                transaction.execute("INSERT INTO recipients(id,email,data) VALUES (?1,?2,?3)", params![id,email,json_text(&recipient)?])
                    .map_err(|error| format!("Could not save contact: {error}"))?;
            }
            for template in templates {
                let id = template.get("id").and_then(Value::as_str).unwrap_or_default();
                transaction.execute("INSERT INTO templates(id,data) VALUES (?1,?2)", params![id,json_text(&template)?])
                    .map_err(|error| format!("Could not save template: {error}"))?;
            }
            for message in sent_mail {
                let id = message.get("messageId").and_then(Value::as_str).unwrap_or_default();
                let sent_at = message.get("sentAt").and_then(Value::as_i64).unwrap_or_default();
                transaction.execute("INSERT OR IGNORE INTO sent_mail(message_id,sent_at,data) VALUES (?1,?2,?3)", params![id,sent_at,json_text(&message)?])
                    .map_err(|error| format!("Could not save sent-mail record: {error}"))?;
            }
            transaction.execute("INSERT OR REPLACE INTO workspace_meta(key,value) VALUES ('mailer_initialized','1')", [])
                .map_err(|error| format!("Could not mark mail storage initialized: {error}"))?;
        }
        "timeless-preferences" => {
            transaction.execute("INSERT INTO preferences(id,data) VALUES (1,?1) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [serialized])
                .map_err(|error| format!("Could not save preferences: {error}"))?;
        }
        _ => return Err("Unknown workspace storage key.".into()),
    }
    transaction.commit().map_err(|error| format!("Could not finish workspace save: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SentMailRecord {
    pub(crate) message_id: String,
    pub(crate) from_email: String,
    pub(crate) recipient_email: String,
    pub(crate) recipient_name: String,
    pub(crate) subject: String,
    pub(crate) sent_at: u64,
}

impl SentMailRecord {
    pub(crate) fn into_value(self) -> Value {
        json!({
            "messageId": self.message_id,
            "fromEmail": self.from_email,
            "recipientEmail": self.recipient_email,
            "recipientName": self.recipient_name,
            "subject": self.subject,
            "sentAt": self.sent_at,
        })
    }
}

pub(crate) fn load_persisted_state(
    app: &AppHandle,
    key: &str,
    legacy: Option<&str>,
) -> Result<Option<String>, String> {
    let connection = open(app)?;
    match key {
        "timeless-preferences" => {
            let stored: Option<String> = connection.query_row("SELECT data FROM preferences WHERE id=1", [], |row| row.get(0)).optional()
                .map_err(|error| format!("Could not read preferences: {error}"))?;
            if stored.is_some() { return Ok(stored); }
            if let Some(value) = legacy {
                save_persisted_state(app, key, value)?;
                return Ok(Some(value.to_string()));
            }
            Ok(None)
        }
        "timeless-mailer" | "postbird-mailer" => {
            let initialized: bool = connection
                .query_row("SELECT EXISTS(SELECT 1 FROM workspace_meta WHERE key='mailer_initialized')", [], |row| row.get(0))
                .map_err(|error| format!("Could not inspect mail storage: {error}"))?;
            let mut legacy_value = legacy.map(str::to_owned);
            if !initialized {
                if let Some(value) = legacy_value.as_deref() {
                    save_persisted_state(app, "timeless-mailer", value)?;
                }
            }
            migrate_sent_history_file(app)?;
            if !initialized && legacy_value.is_none() {
                let has_rows: bool = connection
                    .query_row("SELECT EXISTS(SELECT 1 FROM recipients UNION SELECT 1 FROM templates UNION SELECT 1 FROM sent_mail)", [], |row| row.get(0))
                    .map_err(|error| format!("Could not inspect mail storage: {error}"))?;
                if !has_rows {
                    return Ok(None);
                }
            }
            let recipients = read_json_rows(&connection, "SELECT data FROM recipients ORDER BY rowid")?;
            let templates = read_json_rows(&connection, "SELECT data FROM templates ORDER BY rowid")?;
            let mut sent_mail = read_json_rows(&connection, "SELECT data FROM sent_mail ORDER BY sent_at DESC")?;
            if let Some(value) = legacy_value.take() {
                if let Ok(document) = serde_json::from_str::<Value>(&value) {
                    if let Some(old_records) = document.get("state").and_then(|state| state.get("sentMail")).and_then(Value::as_array) {
                        for record in old_records {
                            let id = record.get("messageId").and_then(Value::as_str).unwrap_or_default();
                            if !sent_mail.iter().any(|existing| existing.get("messageId").and_then(Value::as_str) == Some(id)) {
                                sent_mail.push(record.clone());
                            }
                        }
                    }
                }
            }
            sent_mail.sort_by_key(|item| std::cmp::Reverse(item.get("sentAt").and_then(Value::as_i64).unwrap_or_default()));
            sent_mail.truncate(5_000);
            Ok(Some(json!({"state":{"recipients":recipients,"templates":templates,"sentMail":sent_mail},"version":0}).to_string()))
        }
        _ => Err("Unknown workspace storage key.".into()),
    }
}

fn read_json_rows(connection: &Connection, query: &str) -> Result<Vec<Value>, String> {
    let mut statement = connection.prepare(query).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|error| error.to_string())?;
    rows.map(|row| {
        let value = row.map_err(|error| error.to_string())?;
        serde_json::from_str(&value).map_err(|error| format!("Stored workspace row is invalid: {error}"))
    }).collect()
}

fn migrate_sent_history_file(app: &AppHandle) -> Result<(), String> {
    let path = app.path().app_data_dir().map_err(|error| error.to_string())?.join("sent-mail-history.json");
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not read legacy sent-mail history: {error}")),
    };
    let document: Value = serde_json::from_str(&contents).map_err(|error| format!("Legacy sent-mail history is invalid: {error}"))?;
    let records = document.get("records").and_then(Value::as_array).cloned().unwrap_or_default();
    for record in records {
        let message_id = record.get("messageId").and_then(Value::as_str).unwrap_or_default();
        let sent_at = record.get("sentAt").and_then(Value::as_i64).unwrap_or_default();
        let connection = open(app)?;
        connection.execute("INSERT OR IGNORE INTO sent_mail(message_id,sent_at,data) VALUES (?1,?2,?3)", params![message_id,sent_at,json_text(&record)?])
            .map_err(|error| format!("Could not migrate sent-mail history: {error}"))?;
    }
    Ok(())
}

pub(crate) fn merge_sent_records(app: &AppHandle, records: &[Value]) -> Result<(Vec<Value>, usize), String> {
    let connection = open(app)?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    let mut added = 0;
    for record in records {
        let message_id = record.get("messageId").and_then(Value::as_str).unwrap_or_default();
        let sent_at = record.get("sentAt").and_then(Value::as_i64).unwrap_or_default();
        let count = transaction.execute("INSERT OR IGNORE INTO sent_mail(message_id,sent_at,data) VALUES (?1,?2,?3)", params![message_id,sent_at,json_text(record)?])
            .map_err(|error| format!("Could not save sent-mail record: {error}"))?;
        added += count;
    }
    transaction.execute("DELETE FROM sent_mail WHERE message_id IN (SELECT message_id FROM sent_mail ORDER BY sent_at DESC LIMIT -1 OFFSET 5000)", [])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    let all = read_json_rows(&connection, "SELECT data FROM sent_mail ORDER BY sent_at DESC")?;
    Ok((all, added))
}

#[tauri::command]
pub(crate) fn get_sent_mail_history(app: AppHandle, local_records: Vec<Value>) -> Result<Vec<Value>, String> {
    merge_sent_records(&app, &local_records).map(|(records, _)| records)
}

#[tauri::command]
pub(crate) fn save_scrape_search(app: AppHandle, search: Value) -> Result<(), String> {
    let id = search.get("id").and_then(Value::as_str).ok_or("Scrape search ID is missing.")?;
    let saved_at = search.get("savedAt").and_then(Value::as_i64).unwrap_or_default();
    let connection = open(&app)?;
    connection.execute("INSERT INTO scrape_searches(id,saved_at,data) VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET saved_at=excluded.saved_at,data=excluded.data", params![id,saved_at,json_text(&search)?])
        .map_err(|error| format!("Could not save scraped results: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn get_scrape_searches(app: AppHandle) -> Result<Vec<Value>, String> {
    read_json_rows(&open(&app)?, "SELECT data FROM scrape_searches ORDER BY saved_at DESC")
}

#[tauri::command]
pub(crate) fn delete_scrape_search(app: AppHandle, id: String) -> Result<(), String> {
    open(&app)?.execute("DELETE FROM scrape_searches WHERE id=?1", [id])
        .map_err(|error| format!("Could not delete saved search: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn get_tasks(app: AppHandle) -> Result<Vec<Value>, String> {
    read_json_rows(&open(&app)?, "SELECT json_object('id',id,'title',title,'notes',notes,'completed',completed,'createdAt',created_at,'updatedAt',updated_at) FROM tasks ORDER BY completed ASC, updated_at DESC")
}

#[tauri::command]
pub(crate) fn save_task(app: AppHandle, task: Value) -> Result<(), String> {
    let id = task.get("id").and_then(Value::as_str).ok_or("Task ID is missing.")?;
    let title = task.get("title").and_then(Value::as_str).ok_or("Task title is missing.")?;
    let notes = task.get("notes").and_then(Value::as_str).unwrap_or_default();
    let completed = task.get("completed").and_then(Value::as_bool).unwrap_or(false);
    let created_at = task.get("createdAt").and_then(Value::as_i64).unwrap_or_default();
    let updated_at = task.get("updatedAt").and_then(Value::as_i64).unwrap_or_default();
    open(&app)?.execute("INSERT INTO tasks(id,title,notes,completed,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET title=excluded.title,notes=excluded.notes,completed=excluded.completed,updated_at=excluded.updated_at", params![id,title,notes,completed,created_at,updated_at])
        .map_err(|error| format!("Could not save task: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_task(app: AppHandle, id: String) -> Result<(), String> {
    open(&app)?.execute("DELETE FROM tasks WHERE id=?1", [id])
        .map_err(|error| format!("Could not delete task: {error}"))?;
    Ok(())
}

#[tauri::command]
pub(crate) fn load_workspace_state(app: AppHandle, key: String, legacy: Option<String>) -> Result<Option<String>, String> {
    load_persisted_state(&app, &key, legacy.as_deref())
}

#[tauri::command]
pub(crate) fn save_workspace_state(app: AppHandle, key: String, value: String) -> Result<(), String> {
    save_persisted_state(&app, &key, &value)
}

pub(crate) fn read_secret(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    let stored: Option<String> = open(app)?
        .query_row("SELECT value FROM secrets WHERE name=?1", [name], |row| row.get(0))
        .optional()
        .map_err(|error| format!("Could not read stored credentials: {error}"))?;
    match stored {
        Some(encoded) => match crate::crypto::decrypt(app, &encoded) {
            Ok(value) => Ok(Some(value)),
            Err(_) => {
                // Legacy plaintext value from before encryption was added: migrate it.
                let _ = write_secret(app, name, &encoded);
                Ok(Some(encoded))
            }
        },
        None => Ok(None),
    }
}

pub(crate) fn write_secret(app: &AppHandle, name: &str, value: &str) -> Result<(), String> {
    let encoded = crate::crypto::encrypt(app, value)?;
    open(app)?
        .execute(
            "INSERT INTO secrets(name,value) VALUES(?1,?2) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
            params![name, encoded],
        )
        .map_err(|error| format!("Could not save credentials: {error}"))?;
    Ok(())
}

pub(crate) fn delete_secret(app: &AppHandle, name: &str) -> Result<(), String> {
    open(app)?
        .execute("DELETE FROM secrets WHERE name=?1", [name])
        .map_err(|error| format!("Could not delete credentials: {error}"))?;
    Ok(())
}
