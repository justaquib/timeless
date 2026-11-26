# Development guide

The project-wide rules in [AGENTS.md](../AGENTS.md) are authoritative. This guide describes the local workflow.

## Code quality principles

- **DRY:** Keep repeated business rules, validation, and transformations in one shared owner. Extract abstractions for repeated, coherent behavior—not merely to remove a few similar lines.
- **Boy Scout Rule:** Leave touched code cleaner, clearer, and no less tested than before. Limit cleanup to the files and behavior related to the task.
- **Smart/dumb components:** Every feature must have a smart container for data and orchestration and a dumb view for presentation. Dumb views receive typed props and callbacks; they do not call stores, APIs, query hooks, or toasts. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Approval requirements

- Do not install or add packages unless the user has explicitly approved the specific dependency change.
- Do not add a third-party API, hosted service, provider SDK, or external application/integration without asking first.
- Prefer existing project dependencies and native platform capabilities. Keep SMTP as the configured direct transport unless the user approves another integration.
- Do not add secrets to source, logs, local storage, or documentation.

## File size and responsibility

- Keep every maintained source, script, and documentation file below 404 lines: **403 lines maximum**.
- Run `npm run check:file-length` before finishing changes. Split modules by responsibility rather than compressing or minifying code to satisfy the limit.
- Keep UI, domain rules, persistence, command boundaries, and asynchronous workflows in their respective modules as described in [ARCHITECTURE.md](./ARCHITECTURE.md).
- Update relevant documentation when behavior or architecture changes.

## Local commands

- `npm run dev` — start the Vite frontend.
- `npm run build` — TypeScript check and production frontend build.
- `npm run check:file-length` — enforce the 403-line cap.
- `cd src-tauri && cargo check` — check the Tauri/Rust backend.
- `npm run tauri dev` — run the desktop application.

## Change checklist

1. Read the owning feature and its neighboring modules before editing.
2. Keep changes scoped; reuse installed libraries and existing patterns.
3. Surface failures to the user; do not silently claim SMTP success.
4. Validate the changed behavior and check all maintained files against the line cap.
5. Never test live delivery without an explicitly configured account and an intended recipient.
