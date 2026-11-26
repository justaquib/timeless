use std::collections::HashSet;

use reqwest::blocking::Client;
use serde::Deserialize;

use crate::gmail_auth::{oauth_client, refresh_access_token, response_json};
use crate::sent_history::{SentMailRecord, merge_sent_mail};

const GMAIL_API: &str = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_TRACKED_SENT_MESSAGES: usize = 5_000;
const MAX_SENT_MESSAGES_TO_SCAN: usize = 5_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailMessagePage {
    messages: Option<Vec<GmailMessageRef>>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
struct GmailMessageRef {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GmailMessageMetadata {
    internal_date: String,
    payload: Option<GmailPayload>,
}

#[derive(Deserialize)]
struct GmailPayload {
    #[serde(default)]
    headers: Vec<GmailHeader>,
}

#[derive(Deserialize)]
struct GmailHeader {
    name: String,
    value: String,
}

#[tauri::command]
pub(crate) async fn get_gmail_reply_count(
    client_id: String,
    client_secret: String,
    sent_message_ids: Vec<String>,
    day_start: u64,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        get_gmail_reply_count_sync(client_id, client_secret, sent_message_ids, day_start)
    })
    .await
    .map_err(|error| format!("Gmail reply lookup task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn recover_gmail_sent_mail(
    app: tauri::AppHandle,
    client_id: String,
    client_secret: String,
    from_email: String,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !from_email.contains('@')
            || from_email
                .chars()
                .any(|character| character.is_whitespace() || matches!(character, '<' | '>'))
        {
            return Err("Configure a valid Gmail sender address before recovery.".into());
        }
        let access_token = refresh_access_token(&client_id, &client_secret)?;
        let records =
            find_timeless_sent_messages(&oauth_client()?, &access_token, from_email.trim())?;
        let (_, added) = merge_sent_mail(&app, records)?;
        Ok(added)
    })
    .await
    .map_err(|error| format!("Gmail sent-mail recovery task failed: {error}"))?
}

fn get_gmail_reply_count_sync(
    client_id: String,
    client_secret: String,
    sent_message_ids: Vec<String>,
    day_start: u64,
) -> Result<usize, String> {
    if sent_message_ids.len() > MAX_TRACKED_SENT_MESSAGES {
        return Err("Sent-mail history is too large to check for Gmail replies.".into());
    }
    if sent_message_ids.is_empty() {
        return Ok(0);
    }

    let tracked_ids: HashSet<String> = sent_message_ids
        .iter()
        .map(|message_id| normalize_message_id(message_id))
        .filter(|message_id| !message_id.is_empty())
        .collect();
    if tracked_ids.is_empty() {
        return Ok(0);
    }

    let access_token = refresh_access_token(&client_id, &client_secret)?;
    count_today_replies(&oauth_client()?, &access_token, &tracked_ids, day_start)
}

fn find_timeless_sent_messages(
    client: &Client,
    access_token: &str,
    from_email: &str,
) -> Result<Vec<SentMailRecord>, String> {
    let query = format!("in:sent newer_than:30d from:{from_email}");
    let mut page_token: Option<String> = None;
    let mut scanned = 0;
    let mut records = Vec::new();

    while scanned < MAX_SENT_MESSAGES_TO_SCAN {
        let mut request = client
            .get(format!("{GMAIL_API}/messages"))
            .bearer_auth(access_token)
            .query(&[("q", query.as_str()), ("maxResults", "100")]);
        if let Some(token) = page_token.as_deref() {
            request = request.query(&[("pageToken", token)]);
        }
        let response = request
            .send()
            .map_err(|error| format!("Could not list Gmail sent messages: {error}"))?;
        let page: GmailMessagePage = response_json(response)?;
        let messages = page.messages.unwrap_or_default();
        if messages.is_empty() {
            break;
        }

        for message in messages {
            if scanned == MAX_SENT_MESSAGES_TO_SCAN {
                break;
            }
            scanned += 1;
            let metadata = get_message_metadata(client, access_token, &message.id)?;
            let Some(payload) = metadata.payload else {
                continue;
            };
            let headers = payload.headers;
            let Some(message_id) = header_value(&headers, "Message-ID") else {
                continue;
            };
            if !is_timeless_message_id(message_id) {
                continue;
            }
            let Some((recipient_name, recipient_email)) =
                header_value(&headers, "To").and_then(parse_mailbox_header)
            else {
                continue;
            };
            let from_email = header_value(&headers, "From")
                .and_then(parse_mailbox_header)
                .map(|(_, email)| email)
                .unwrap_or_else(|| from_email.to_string());
            let sent_at = metadata
                .internal_date
                .parse::<u64>()
                .map_err(|error| format!("Gmail returned an invalid sent date: {error}"))?;
            records.push(SentMailRecord {
                message_id: message_id.to_string(),
                from_email,
                recipient_email,
                recipient_name,
                subject: header_value(&headers, "Subject")
                    .unwrap_or_default()
                    .to_string(),
                sent_at,
            });
        }

        match page.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(records)
}

fn count_today_replies(
    client: &Client,
    access_token: &str,
    tracked_ids: &HashSet<String>,
    day_start: u64,
) -> Result<usize, String> {
    let query = format!("in:inbox after:{}", day_start.saturating_sub(86_400));
    let earliest_today = day_start.saturating_mul(1_000);
    let mut page_token: Option<String> = None;
    let mut replies = HashSet::new();

    loop {
        let mut request = client
            .get(format!("{GMAIL_API}/messages"))
            .bearer_auth(access_token)
            .query(&[("q", query.as_str()), ("maxResults", "100")]);
        if let Some(token) = page_token.as_deref() {
            request = request.query(&[("pageToken", token)]);
        }
        let response = request
            .send()
            .map_err(|error| format!("Could not list Gmail inbox messages: {error}"))?;
        let page: GmailMessagePage = response_json(response)?;
        for message in page.messages.unwrap_or_default() {
            let metadata = get_message_metadata(client, access_token, &message.id)?;
            let received_at = metadata
                .internal_date
                .parse::<u64>()
                .map_err(|error| format!("Gmail returned an invalid message date: {error}"))?;
            if received_at < earliest_today {
                continue;
            }
            if let Some(payload) = metadata.payload {
                let headers = payload.headers;
                let is_reply = headers.iter().any(|header| {
                    matches!(
                        header.name.to_ascii_lowercase().as_str(),
                        "in-reply-to" | "references"
                    ) && referenced_ids(&header.value)
                        .iter()
                        .any(|message_id| tracked_ids.contains(message_id))
                });
                if is_reply {
                    replies.insert(message.id);
                }
            }
        }
        match page.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    Ok(replies.len())
}

fn get_message_metadata(
    client: &Client,
    access_token: &str,
    message_id: &str,
) -> Result<GmailMessageMetadata, String> {
    let response = client
        .get(format!("{GMAIL_API}/messages/{message_id}"))
        .bearer_auth(access_token)
        .query(&[
            ("format", "metadata"),
            ("metadataHeaders", "Message-ID"),
            ("metadataHeaders", "To"),
            ("metadataHeaders", "From"),
            ("metadataHeaders", "Subject"),
            ("metadataHeaders", "In-Reply-To"),
            ("metadataHeaders", "References"),
        ])
        .send()
        .map_err(|error| format!("Could not read Gmail reply metadata: {error}"))?;
    response_json(response)
}

fn header_value<'a>(headers: &'a [GmailHeader], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|header| header.name.eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str())
}

fn parse_mailbox_header(value: &str) -> Option<(String, String)> {
    let (name, email) = match (value.rfind('<'), value.rfind('>')) {
        (Some(start), Some(end)) if start < end => (
            value[..start].trim().trim_matches('"').to_string(),
            value[start + 1..end].trim().to_string(),
        ),
        _ => (String::new(), value.trim().to_string()),
    };
    email.contains('@').then_some((name, email))
}

fn is_timeless_message_id(message_id: &str) -> bool {
    message_id
        .trim()
        .trim_matches(|character| character == '<' || character == '>')
        .to_ascii_lowercase()
        .starts_with("timeless-")
}

fn normalize_message_id(message_id: &str) -> String {
    message_id
        .trim()
        .trim_matches(|character| character == '<' || character == '>')
        .to_ascii_lowercase()
}

fn referenced_ids(header_value: &str) -> Vec<String> {
    header_value
        .split_whitespace()
        .map(normalize_message_id)
        .filter(|message_id| !message_id.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        is_timeless_message_id, normalize_message_id, parse_mailbox_header, referenced_ids,
    };

    #[test]
    fn message_id_comparison_normalizes_brackets_and_case() {
        assert_eq!(
            normalize_message_id("<Timeless-123@example.com>"),
            "timeless-123@example.com"
        );
    }

    #[test]
    fn reply_headers_can_reference_multiple_sent_messages() {
        assert_eq!(
            referenced_ids("<first@example.com> <second@example.com>"),
            vec!["first@example.com", "second@example.com"]
        );
    }

    #[test]
    fn recovery_matches_only_timeless_message_ids() {
        assert!(is_timeless_message_id("<timeless-123@example.com>"));
        assert!(!is_timeless_message_id("<other-123@example.com>"));
    }

    #[test]
    fn parses_gmail_mailbox_headers() {
        assert_eq!(
            parse_mailbox_header("Client Name <client@example.com>"),
            Some(("Client Name".into(), "client@example.com".into()))
        );
        assert_eq!(
            parse_mailbox_header("client@example.com"),
            Some((String::new(), "client@example.com".into()))
        );
        assert_eq!(parse_mailbox_header("invalid"), None);
    }
}
