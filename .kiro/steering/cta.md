---
inclusion: always
---

# CTA Design System

## Button Variants

All variants use CSS tokens from `globals.css` — no hardcoded hex values.

| Variant         | Tokens used                                                               | When to use                                   |
| --------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `cta-primary`   | `bg-primary-500` · `text-white` · `rounded-sm`                            | One per page. The main action.                |
| `cta-secondary` | `border-primary-500` · `text-primary-500` · `rounded-sm` · transparent bg | Alternative action, less urgent than primary. |
| `cta-accent`    | `bg-secondary-500` · `text-white` · `rounded-sm` · glow on hover          | Promotions, upsell, onboarding highlights.    |
| `cta-ghost`     | `text-muted-foreground` · `rounded-sm` · underline on hover               | Tertiary actions: skip, cancel, back.         |
| `cta-danger`    | `bg-error-500` · `text-white` · `rounded-sm`                              | Delete, irreversible actions only.            |
| `cta-code`      | `font-mono` · `bg-grey-100` · `border-grey-300` · `rounded-sm`            | npm commands, copy snippet, code actions.     |

## Usage Rules

### Hierarchy per page

- **1 primary CTA max** per view. If you need two, one is secondary.
- Primary → Secondary → Ghost. Never two primaries side by side.
- Accent CTA is reserved for upsell/onboarding moments — not general navigation.

### Copy rules (aligned with brand voice)

- Action-first: `"Start free"` not `"Get started for free today"`
- Outcome-implied: `"See your usage"` not `"Click here to view usage data"`
- No hedging: `"Connect"` not `"Try connecting"`

### Danger CTA

- Always pair with a confirmation dialog or destructive alert.
- Label must state the action clearly: `"Delete project"` not `"Confirm"`.

### Code CTA

- Use for copyable commands only: `npm install @gatectr/sdk`
- Always include a copy icon (`Copy` from lucide-react).

## Examples

```tsx
// Primary — one per page
<Button variant="cta-primary" size="lg">Start free</Button>

// Secondary — alternative action
<Button variant="cta-secondary">View docs</Button>

// Accent — onboarding / upsell
<Button variant="cta-accent">Upgrade to Pro</Button>

// Ghost — skip / cancel
<Button variant="cta-ghost">Skip for now</Button>

// Danger — destructive
<Button variant="cta-danger">Delete project</Button>

// Code — copy snippet
<Button variant="cta-code">
  <Copy className="size-3" />
  npm install @gatectr/sdk
</Button>
```

## Sizes

Use standard shadcn sizes with CTA variants:

| Size      | Height | Use                                    |
| --------- | ------ | -------------------------------------- |
| `sm`      | 32px   | Inline actions, table rows             |
| `default` | 36px   | Most UI contexts                       |
| `lg`      | 40px   | Hero CTAs, onboarding, marketing pages |

## Dark Mode

All CTA variants handle dark mode automatically via CSS tokens in `globals.css`:

- `cta-primary` — `primary-500` stays Navy in light, shifts to Cyan in dark (via `--primary` token)
- `cta-secondary` — border/text shifts to `primary-400` for contrast in dark mode
- `cta-code` — shifts to `grey-700` bg with `grey-100` text
- `cta-accent` — `secondary-500` glow intensity is preserved

## Anti-patterns

```tsx
// ❌ Two primaries side by side
<Button variant="cta-primary">Save</Button>
<Button variant="cta-primary">Cancel</Button>

// ✅ Primary + Ghost
<Button variant="cta-primary">Save</Button>
<Button variant="cta-ghost">Cancel</Button>

// ❌ Accent for a regular nav action
<Button variant="cta-accent">Go to dashboard</Button>

// ✅ Accent for upsell only
<Button variant="cta-accent">Upgrade — save 40% on tokens</Button>

// ❌ Vague danger label
<Button variant="cta-danger">Confirm</Button>

// ✅ Clear danger label
<Button variant="cta-danger">Delete API key</Button>
```
