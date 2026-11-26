# Project coding rules

These rules apply to all code and documentation changes in Postbird.

## Design and maintenance

- **DRY:** Keep one source of truth for domain rules, validation, and shared behavior. Extract a helper when the same meaningful behavior is repeated; avoid speculative abstractions for one-off code.
- **Boy Scout Rule:** Leave a file cleaner than you found it when making a change. Keep cleanup directly related to the touched code; do not turn a focused task into an unrelated rewrite.
- **Small modules:** Keep every maintained file at 403 lines or fewer. Split by responsibility; never minify or compress code to satisfy the limit.
- **Explicit boundaries:** Keep presentation, state/orchestration, domain rules, persistence, and external command calls in their designated layers.

## Smart and dumb components

- Every feature must separate its **smart/container component** from its **dumb/presentational component**.
- Smart components own data subscriptions, store access, query/mutation hooks, side effects, and workflow orchestration. They pass typed data and callbacks down.
- Dumb components render from props and report user intent through callbacks. They must not call APIs, access global stores, show toasts, or own business rules.
- Keep shared presentational components domain-neutral. Do not duplicate UI logic to avoid passing a prop.
- When changing an existing feature, bring the touched behavior into this separation without performing unrelated migrations.

## Dependency and integration approval

- Do not install or add packages without explicit user approval for the dependency change.
- Ask before adding any third-party API, hosted service, provider SDK, or external application/integration.
- Prefer the dependencies and native platform capabilities already in the project.
- Never put credentials or other secrets in source, frontend persistence, logs, or documentation.

## Completion

- Follow existing style and Tailwind conventions; update the relevant docs when architecture or behavior changes.
- Surface failures rather than silently falling back or reporting success.
- Run `npm run build`, `npm run check:file-length`, and relevant backend checks for code changes.
