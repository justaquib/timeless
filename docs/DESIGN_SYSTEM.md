# Design system

Timeless uses a quiet, desktop-first visual language: clear hierarchy, compact navigation, and generous room for writing and reviewing messages.

## Principles

- Keep the message, recipient list, and delivery state visible together.
- Use restrained color; reserve strong color for the primary action and active navigation.
- Prefer plain language and explain consequences before sending.
- Keep recipient addresses private by sending one message per recipient.
- Build layouts mobile-first and add multi-column layouts at larger breakpoints.

## Foundations

| Role | Token / utility | Use |
| --- | --- | --- |
| App canvas | `bg-[#f5f6fa]` | Main workspace background |
| Surface | `bg-white` | Cards, navigation, dialogs |
| Primary | `indigo-600` | Main action and active brand |
| Primary hover | `indigo-700` | Hover state for primary actions |
| Text | `slate-900`, `slate-700`, `slate-500` | Heading, body, secondary text |
| Border | `slate-200` | Card, field, and divider boundaries |
| Success | `emerald-*` | Connected and delivered states |
| Warning | `amber-*` | Caution and setup guidance |
| Error | `rose-*` | Validation and delivery errors |

Use the Tailwind default sans-serif stack. Page titles use approximately `text-2xl font-semibold`; card titles use `text-sm font-semibold`; labels and helper text use `text-xs`.

## Components and layout

- Cards: `rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`.
- Form controls: white backgrounds, slate borders, rounded corners, and an indigo focus ring.
- File upload controls: show selected and pending files with filename and size; provide a clear remove action and explain the 10-file / 10 MB total limit.
- Dialogs: centered, scrollable panels with a dark translucent backdrop; dialogs must have a title and accessible dialog semantics.
- Icons: use Lucide React at small, consistent sizes; pair icons with visible labels for important actions.
- Spacing follows Tailwind's 4px scale; use consistent gaps rather than one-off margins.
- At desktop widths, keep the 248px navigation rail fixed and let the content area scroll.

## Styling rules

Tailwind utility classes are the default styling mechanism. `src/App.css` is the Tailwind entry point and imports Tailwind. If reusable CSS is required, compose it with Tailwind `@apply` utilities and keep component-specific rules close to their owning component. Do not introduce a second styling framework or design-token package without approval.

Maintain keyboard focus visibility, semantic buttons and labels, readable contrast, and useful empty, loading, success, and error states.
