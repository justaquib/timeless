use std::{
    fs,
    sync::atomic::Ordering,
    time::{SystemTime, UNIX_EPOCH},
};

use lettre::{
    Message, Transport,
    message::{Attachment, Mailbox, MultiPart, SinglePart, header::ContentType},
};
use tauri::AppHandle;

use super::{
    MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MESSAGE_ID_SEQUENCE, MailAttachment, MailSendReceipt,
    attachment_directory, build_transport, safe_attachment_name, stored_settings,
    validate_attachment_id,
};

fn parse_copy_mailboxes(addresses: Vec<String>, field: &str) -> Result<Vec<Mailbox>, String> {
    addresses
        .into_iter()
        .map(|address| {
            let address = address.trim();
            if address.is_empty() {
                return Err(format!("{field} email address cannot be empty."));
            }
            let parsed = address
                .parse()
                .map_err(|_| format!("{field} email address is invalid."))?;
            Ok(Mailbox::new(None, parsed))
        })
        .collect()
}

#[tauri::command]
pub(super) fn send_email(
    app: AppHandle,
    daily_limit: usize,
    to_email: String,
    to_name: String,
    cc_emails: Vec<String>,
    bcc_emails: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<MailAttachment>,
) -> Result<MailSendReceipt, String> {
    if attachments.len() > MAX_ATTACHMENTS {
        return Err("A message cannot include more than 10 attachments.".into());
    }
    let settings = stored_settings(&app)?;
    let transport = build_transport(&settings)?;
    let history_from_email = settings.from_email.clone();
    let history_recipient_email = to_email.clone();
    let history_recipient_name = to_name.clone();
    let history_subject = subject.clone();
    let from = Mailbox::new(
        Some(settings.from_name.clone()),
        settings
            .from_email
            .parse()
            .map_err(|_| "Stored sender email address is invalid.".to_string())?,
    );
    let to = Mailbox::new(
        if to_name.trim().is_empty() {
            None
        } else {
            Some(to_name)
        },
        to_email
            .parse()
            .map_err(|_| "Recipient email address is invalid.".to_string())?,
    );
    let cc = parse_copy_mailboxes(cc_emails, "Cc")?;
    let bcc = parse_copy_mailboxes(bcc_emails, "Bcc")?;
    let recipient_count = 1 + cc.len() + bcc.len();
    let mut message = MultiPart::mixed().singlepart(SinglePart::plain(body));
    let mut total_size = 0usize;
    for attachment in attachments {
        validate_attachment_id(&attachment.id)?;
        let name = safe_attachment_name(&attachment.name)?;
        let bytes = fs::read(attachment_directory(&app)?.join(&attachment.id))
            .map_err(|error| format!("Could not read attachment {name}: {error}"))?;
        if bytes.len() as u64 != attachment.size {
            return Err(format!(
                "Attachment {name} has changed; add it to the template again."
            ));
        }
        total_size = total_size
            .checked_add(bytes.len())
            .ok_or_else(|| "Total attachment size is too large.".to_string())?;
        if total_size > MAX_ATTACHMENT_BYTES {
            return Err("Total attachment size cannot exceed 10 MB.".into());
        }
        let content_type = ContentType::parse(&attachment.content_type)
            .map_err(|_| format!("Attachment {name} has an invalid content type."))?;
        message = message.singlepart(Attachment::new(name).body(bytes, content_type));
    }
    let message_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Could not create an email identifier: {error}"))?;
    let sent_at = message_time.as_secs();
    let message_id_time = message_time.as_nanos();
    let sender_domain = settings
        .from_email
        .rsplit('@')
        .next()
        .unwrap_or("timeless.local")
        .trim_end_matches('>');
    let message_id = format!(
        "<timeless-{message_id_time}-{}@{sender_domain}>",
        MESSAGE_ID_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let mut email_builder = Message::builder().from(from).to(to);
    for mailbox in cc {
        email_builder = email_builder.cc(mailbox);
    }
    for mailbox in bcc {
        email_builder = email_builder.bcc(mailbox);
    }
    let email = email_builder
        .subject(subject)
        .message_id(Some(message_id.clone()))
        .multipart(message)
        .map_err(|error| format!("Could not compose the email: {error}"))?;
    let _mail_send_guard =
        super::mail_limits::acquire_send_guard(&app, &settings, recipient_count, daily_limit)?;
    transport.send(&email).map_err(|error| {
        format!(
            "Email delivery failed: {error}. This attempt counts toward the Timeless {} rolling 24-hour limit to avoid accidental duplicates.",
            super::mail_limits::provider_label(super::mail_limits::provider_family(&settings))
        )
    })?;
    let history_save_error = crate::database::merge_sent_records(&app, &[serde_json::json!({
        "messageId": message_id,
        "fromEmail": history_from_email,
        "recipientEmail": history_recipient_email,
        "recipientName": history_recipient_name,
        "subject": history_subject,
        "sentAt": sent_at.saturating_mul(1_000),
    })]).err();
    Ok(MailSendReceipt {
        message_id,
        sent_at,
        history_save_error,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_copy_mailboxes;
    use lettre::{Message, message::Mailbox};

    #[test]
    fn validates_copy_recipient_addresses() {
        assert_eq!(
            parse_copy_mailboxes(
                vec!["first@example.com".into(), "second@example.com".into()],
                "Cc"
            )
            .unwrap()
            .len(),
            2
        );
        assert!(parse_copy_mailboxes(vec!["not-an-email".into()], "Bcc").is_err());
    }

    #[test]
    fn bcc_recipients_are_not_written_as_a_message_header() {
        let email = Message::builder()
            .from("sender@example.com".parse::<Mailbox>().unwrap())
            .to("to@example.com".parse::<Mailbox>().unwrap())
            .bcc("hidden@example.com".parse::<Mailbox>().unwrap())
            .body("test".to_string())
            .unwrap();
        let formatted = String::from_utf8(email.formatted()).unwrap();
        assert!(!formatted.lines().any(|line| line.starts_with("Bcc:")));
    }
}
