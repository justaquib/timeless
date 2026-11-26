# Architecture

Timeless is a Tauri desktop application with a React and TypeScript frontend. The frontend owns presentation and local workspace state; the Rust Tauri layer owns SMTP delivery, Google OAuth token exchange, and secure credential access.

## Source layout

```text
src/
  App.tsx                    App shell and section composition
  components/                Focused views and dialogs
  components/PreferencesContainer.tsx  Preference state orchestration
  components/PreferencesView.tsx       Preference controls
  domain/mailer.ts           Mail types, validation, parsing, token rendering
  domain/preferences.ts     Appearance, provider limits, preference defaults
  domain/webScraper.ts       Website crawl and result parsing rules
  domain/workspace.ts        Workspace navigation and section metadata
  hooks/                     Query and send-queue orchestration
  services/mailerApi.ts      Typed boundary for Tauri mail commands
  services/webScraperApi.ts  Typed boundary for website fetch command
  store/mailerStore.ts       Persisted templates and recipients
  config.ts                  Google Desktop OAuth client configuration
  main.tsx                   React Query and toast providers
src-tauri/
  src/lib.rs                 SMTP commands and keychain integration
  src/gmail.rs               Gmail account safety ceilings
  src/mail_limits.rs         Provider-family rolling-window limits and ledger
  src/gmail_auth.rs          Loopback OAuth, token refresh, and secure storage
  src/gmail_replies.rs       Read-only Gmail reply metadata lookup
  src/web_scraping.rs       Bounded public-site HTML fetch command
docs/                        Product and engineering documentation
scripts/check-file-length.mjs Source/document line-limit guard
```

Put email rules in `domain`, persisted client state in `store`, command calls in `services`, and asynchronous workflows in `hooks`.

## Component responsibilities

Use the smart/dumb component pattern for every feature:

- **Smart/container:** owns subscriptions to stores and queries, mutation and workflow hooks, side effects, and coordination with services. It passes typed props and event callbacks to its view.
- **Dumb/presentational:** renders the supplied data and invokes callbacks for user intent. It does not read a global store, call a service/API, invoke query hooks, show toasts, or make business decisions.
- **Shared UI:** remains domain-neutral and receives its state through props.

Name and colocate a feature's container and view so their boundary is easy to find. Keep one-off layout markup local instead of building speculative abstractions. When changing a legacy component, separate responsibilities as part of that scoped change; do not trigger unrelated migrations.

## Runtime flow

1. `main.tsx` creates the React root, TanStack Query client, and toast container.
2. The app shows a 5.5-second Timeless splash, then offers Google sign-in with an option to continue without Gmail. Sign-in uses the system browser, a loopback callback, and PKCE.
3. `App.tsx` composes the active workspace section and owns temporary navigation/draft state; new feature containers own their feature-specific data coordination.
4. Templates, contacts, sent receipts, appearance, splash music, and per-provider recipient limits persist locally through Zustand. SMTP secrets and the Gmail refresh token are never persisted by the frontend.
5. `useSmtpSettings` reads the public SMTP account fields through the Tauri command boundary.
6. Saving and testing SMTP settings call Rust commands. Rust stores SMTP credentials and the Gmail refresh token in the OS credential store.
7. Template attachment bytes are stored in the Tauri app data directory; only their names, MIME types, sizes, and generated IDs are kept with the local template metadata.
8. `useSendQueue` sends at most 100 messages serially, with a three-second delay between attempts. Each message contains one primary recipient plus any configured Cc/Bcc recipients and the template's attachments; successful receipts include a Message-ID used for history and reply matching.
9. Rust reserves each To/Cc/Bcc delivery in a per-provider-account rolling 24-hour ledger before SMTP delivery and enforces the configured family limit. Gmail is additionally capped at 400 recipients for personal Gmail or 1,600 for Workspace and paced at least three seconds apart. The compose view shows remaining slots and the next expiry. Failed attempts remain counted to avoid accidental duplicates.
10. Rust builds a plain-text MIME message with the selected attachments and delivers it over the configured SMTP connection.
11. Successful receipts are stored in an atomic JSON history file under the Tauri app data directory. Existing webview history is merged into this file on app startup.
12. When signed into Gmail, the dashboard uses Gmail API read-only metadata calls to count today's inbox replies whose `In-Reply-To` or `References` headers match Timeless Message-IDs. The Sent view can optionally scan Gmail's Sent metadata for the last 30 days and import only messages with Timeless-generated Message-IDs. Message bodies are not requested or stored.
13. The Web scraper container fetches up to 20 same-origin HTML pages through a bounded Tauri command, extracts matching page text and published-date metadata, and opens individual links or share dialogs. No website content is persisted.

## Trust boundaries

- Browser preview cannot save credentials or send mail; those commands require the Tauri runtime.
- Website scraping is available only in the Tauri runtime. Requests are restricted to public IP addresses, same-origin redirects, HTML responses, and 2 MB per page; the frontend crawls at most 20 same-origin pages and does not execute fetched scripts.
- The SMTP password is only present in the settings form and Tauri IPC call while being saved/tested. Rust stores it using the OS keychain.
- Google OAuth uses a public Desktop client and PKCE; an optional client secret is bundled with the desktop app when configured and cannot be kept confidential. The refresh token is stored in the OS keychain. The Gmail API scope is read-only; reply tracking and optional sent-history recovery request message metadata only.
- Attachment files are stored locally under the app data directory, not in browser localStorage. Each message is limited to 10 files and 10 MB total.
- Do not log, return, or persist the SMTP password in frontend storage.
- Every send is user-confirmed. Failures are recorded per recipient, and stopping takes effect after the active send completes.
- Provider-family limits are stored in the Tauri app data directory per SMTP account. They track Timeless recipient deliveries on this device only; Gmail and other providers may count recipients sent elsewhere. The local Gmail cap does not guarantee compliance with changing provider limits or inbox placement.
- Zoho, Outlook.com, and Microsoft 365 use SMTP presets only. Google sign-in and read-only reply tracking are the only Gmail API operations; sending remains SMTP-based.

## Current persistence boundaries

Templates, contacts, preferences, and up to 5,000 successful sent receipts persist in local webview storage, with sent receipts also stored in the Tauri app data directory. Attachment file bytes and the provider-family send ledger also persist in the Tauri app data directory. Delivery failures remain session-only. HTML email and automatic retries are not implemented.
