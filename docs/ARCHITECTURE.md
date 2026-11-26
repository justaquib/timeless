# Architecture

Timeless is a Tauri desktop application with a React and TypeScript frontend. The frontend owns presentation and local workspace state; the Rust Tauri layer owns SMTP delivery, Google OAuth token exchange, and secure credential access.

## Source layout

```text
src/
  App.tsx                    App shell and section composition
  components/                Focused views and dialogs
  domain/mailer.ts           Mail types, validation, parsing, token rendering
  hooks/                     Query and send-queue orchestration
  services/mailerApi.ts      Typed boundary for Tauri mail commands
  store/mailerStore.ts       Persisted templates and recipients
  config.ts                  Google Desktop OAuth client configuration
  main.tsx                   React Query and toast providers
src-tauri/
  src/lib.rs                 SMTP commands and keychain integration
  src/gmail.rs               Gmail rolling-window quota and pacing safeguards
  src/gmail_auth.rs          Loopback OAuth, token refresh, and secure storage
  src/gmail_replies.rs       Read-only Gmail reply metadata lookup
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
4. Templates, contacts, and a migration copy of successful sent receipts persist locally through Zustand. SMTP secrets and the Gmail refresh token are never persisted by the frontend.
5. `useSmtpSettings` reads the public SMTP account fields through the Tauri command boundary.
6. Saving and testing SMTP settings call Rust commands. Rust stores SMTP credentials and the Gmail refresh token in the OS credential store.
7. Template attachment bytes are stored in the Tauri app data directory; only their names, MIME types, sizes, and generated IDs are kept with the local template metadata.
8. `useSendQueue` sends at most 100 messages serially, with a three-second delay between attempts. Each message contains one primary recipient plus any configured Cc/Bcc recipients and the template's attachments; successful receipts include a Message-ID used for history and reply matching.
9. For `smtp.gmail.com`, Rust reserves every To/Cc/Bcc recipient in a local rolling 24-hour ledger before SMTP delivery and enforces 400 recipients for personal Gmail or 1,600 for Workspace, plus a minimum three-second interval between messages. The compose view shows a live countdown to the oldest reservation's expiry. Reserved recipients remain counted if SMTP delivery fails, avoiding unsafe automatic retries.
10. Rust builds a plain-text MIME message with the selected attachments and delivers it over the configured SMTP connection.
11. Successful receipts are stored in an atomic JSON history file under the Tauri app data directory. Existing webview history is merged into this file on app startup.
12. When signed into Gmail, the dashboard uses Gmail API read-only metadata calls to count today's inbox replies whose `In-Reply-To` or `References` headers match Timeless Message-IDs. The Sent view can optionally scan Gmail's Sent metadata for the last 30 days and import only messages with Timeless-generated Message-IDs. Message bodies are not requested or stored.

## Trust boundaries

- Browser preview cannot save credentials or send mail; those commands require the Tauri runtime.
- The SMTP password is only present in the settings form and Tauri IPC call while being saved/tested. Rust stores it using the OS keychain.
- Google OAuth uses a public Desktop client and PKCE; an optional client secret is bundled with the desktop app when configured and cannot be kept confidential. The refresh token is stored in the OS keychain. The Gmail API scope is read-only; reply tracking and optional sent-history recovery request message metadata only.
- Attachment files are stored locally under the app data directory, not in browser localStorage. Each message is limited to 10 files and 10 MB total.
- Do not log, return, or persist the SMTP password in frontend storage.
- Every send is user-confirmed. Failures are recorded per recipient, and stopping takes effect after the active send completes.
- Gmail usage history is stored under the Tauri app data directory, keyed by SMTP username. It tracks Timeless recipients on this device only; other devices and Gmail clients may have already used part of Google's account-wide allowance. Provider limits can vary, and pacing does not guarantee inbox placement.
- Zoho, Outlook.com, and Microsoft 365 use SMTP presets only. Google sign-in and read-only reply tracking are the only Gmail API operations; sending remains SMTP-based.

## Current persistence boundaries

Templates, contacts, and up to 5,000 successful sent receipts persist in local webview storage, with sent receipts also stored in the Tauri app data directory. Attachment file bytes and the Gmail send ledger also persist in the Tauri app data directory. Delivery failures remain session-only. HTML email and automatic retries are not implemented.
