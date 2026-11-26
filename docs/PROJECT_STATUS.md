# Project status

**Updated:** 2026-11-26  
**Product:** Timeless personal desktop workspace

## Current state

The application is a Tauri + React personal workspace with email outreach, provider-specific sending limits, and web research. SMTP delivery, desktop website fetching, and real provider connections require local user configuration.

## Implemented

- Compose view with template selection, token preview, and recipient count.
- Template create, edit, and delete flows.
- Manual contact entry plus CSV/text import, duplicate filtering, and a 100-contact cap.
- SMTP settings with STARTTLS and SSL/TLS options.
- Gmail quick setup for `smtp.gmail.com:587` with STARTTLS and App Password instructions.
- Zoho Mail, Outlook.com, and Microsoft 365 SMTP quick presets.
- Timeless startup splash with an original synthesized intro cue and optional Google sign-in.
- Google desktop OAuth using PKCE and a loopback callback; Gmail refresh credentials are stored in the OS keychain.
- SMTP credentials stored by Rust in the operating system credential store.
- SMTP connection test command and per-recipient send command.
- Template attachments stored in the Tauri app data directory and included on each sequential send (maximum 10 files / 10 MB total per message).
- Sequential send queue with confirmation, progress, failure status, and stop-after-current behavior.
- Durable sent-mail history in Tauri app data, migrated from existing webview history, plus a sent-mail view and dashboard count.
- Optional Gmail Sent recovery for the last 30 days; it imports only message metadata for messages with Timeless-generated Message-IDs.
- Gmail read-only reply count for inbox replies received today that reference Timeless-sent Message-IDs. Message bodies are not fetched or stored.
- Gmail sends use a local rolling 24-hour recipient cap (400 personal Gmail / 1,600 Workspace) and at least three seconds between messages. To, Cc, and Bcc recipients count toward the cap; failed attempts remain counted. The compose view shows a live countdown to the next recipient-slot expiry. The UI explains that external recipients also count toward Google's limits and inbox placement is not guaranteed.
- Local persistence for contact and template data.
- Tailwind-based responsive interface and Lucide icons.
- Architecture, design system, development, and status documentation.

## Known limitations

- Only the latest 5,000 successful sent receipts persist. Failed delivery details are session-only.
- Gmail OAuth requires a Google Desktop OAuth client ID and Gmail API enabled in the user's Google Cloud project. If Google's token endpoint explicitly requests it, the matching Desktop client secret can be configured; desktop OAuth values are public and cannot be kept confidential. Gmail reply tracking only counts replies in the connected Gmail inbox that reference messages sent from the same address.
- Gmail OAuth and live reply counting have not been tested end-to-end because the token exchange and a signed-in Gmail test account have not been verified in this environment.
- Messages are plain text. HTML templates, scheduled sends, and retry-only-failed are not available.
- CSV parsing currently expects one address per row or a name/address row; it is not a full CSV dialect parser.
- SMTP deliverability and provider-specific App Password availability depend on account settings and remain unverified here. The ledger only tracks Timeless recipients on this device and cannot account for email sent elsewhere.
- Gmail's actual limits can vary; the app's local caps provide headroom but do not prevent Google restrictions or guarantee inbox placement.
- SMTP credentials need to be re-entered when updating settings; the password is intentionally never read back into the UI.

## Verification

Run `npm run build`, `npm run check:file-length`, `cargo fmt -- --check`, and `cargo test` from `src-tauri/`. Real delivery should only be verified with a user-configured test account and a recipient who has agreed to receive the test.

## Near-term engineering priorities

1. Configure a Google Desktop OAuth client ID and, if requested by Google's token endpoint, its matching client secret; verify sign-in/reply matching with a consented test account.
2. Verify SMTP connections and delivery with explicitly configured Zoho and Microsoft test accounts.
3. Improve CSV quoting and report invalid rows before import.
4. Consider durable failure logs and campaign history.
