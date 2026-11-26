# Timeless

Timeless is a personal desktop workspace for reusable email templates, contact management, secure SMTP sending, and focused web research. Email sequences support up to 100 contacts, with optional CC/BCC copies; templates can include up to 10 attachments with a combined size of 10 MB.

SMTP delivery, secure credential storage, and Google sign-in require the Tauri desktop runtime. Credentials are stored in the operating system keychain; browser preview does not send mail.

Quick SMTP setup is available for Gmail, Zoho Mail, Outlook.com, and Microsoft 365. Gmail sending uses a Google App Password and keeps a conservative local cap of 400 recipients per rolling 24 hours for personal Gmail or 1,600 for Workspace, with at least three seconds between messages. To, Cc, and Bcc recipients all count toward this local cap. Google limits vary and include recipients sent outside Timeless; the app cannot guarantee inbox placement or prevent provider restrictions.

## Google sign-in and reply tracking

1. Enable the Gmail API in your Google Cloud project and create an OAuth client with type **Desktop app**.
2. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to that client ID. Google documents the Desktop app client secret as optional, but if the token endpoint reports it missing, set `VITE_GOOGLE_CLIENT_SECRET` to the secret for that same Desktop app client.
3. Restart the dev server or rebuild the app.

Google sign-in is optional. Timeless uses a PKCE authorization flow in the system browser and requests Gmail read-only access. Desktop OAuth clients are public clients; any client secret configured in `.env.local` is bundled with the app and cannot be kept confidential. Use only a Desktop app client, never a confidential Web app client secret. The dashboard counts today's inbox replies whose `In-Reply-To` or `References` headers match sent Message-IDs from the connected Gmail address; it requests headers only, not message bodies. The Google refresh token is stored in the OS keychain. Gmail OAuth must be configured and tested in your own Google Cloud project.

Successful sent receipts (up to 5,000) are stored locally in the app's webview storage. The dashboard sent count can be filtered by today, this week (Monday-start), this month, or this year using the computer's local calendar.

## Preferences

The Preferences page stores your appearance, splash-screen intro music setting, and separate rolling 24-hour recipient limits for Gmail, Zoho, Outlook.com, Microsoft 365, and custom SMTP. Each To/Cc/Bcc delivery counts toward the selected provider family limit; Gmail's existing 400-recipient personal or 1,600-recipient Workspace safety ceiling still applies. Limits persist in local preferences and are enforced by the desktop backend.

## Website search

The Web scraper section scans up to 20 pages linked from a public website URL for a keyword or phrase. Results can be filtered to the past 24 hours, 7, 30, or 90 days, or from a chosen date, and opened or shared individually through WhatsApp or Telegram. The app fetches HTML directly from the entered site; it does not use a hosted scraping service. Pages that require sign-in or render content only with JavaScript may not be searchable, and pages without published-date metadata cannot be date-verified. Requests are limited to public HTTP/HTTPS hosts and HTML pages up to 2 MB.

## Development

- `npm run dev` — run the frontend.
- `npm run build` — type-check and build the frontend.
- `npm run check:file-length` — verify the maintained-file 403-line limit.
- `cd src-tauri && cargo check` — check the desktop backend.
- `cd src-tauri && cargo test` — run backend unit tests.

## Project documentation

- [Project coding rules](./AGENTS.md)
- [Design system](./docs/DESIGN_SYSTEM.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Project status](./docs/PROJECT_STATUS.md)
- [Development guide and approval rules](./docs/DEVELOPMENT.md)

## IDE setup

Recommended: VS Code with the Tauri extension and `rust-analyzer`.
