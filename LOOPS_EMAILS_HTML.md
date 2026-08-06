# TimetoPay — Loops email templates (LMX)

The emails live in this repo as **LMX**, Loops' own XML format, and are **pushed
over the API**. There are no zips and no manual uploads.

- Source of truth: [`email-templates/build.mjs`](email-templates/build.mjs) — copy, subjects and shared design
- Build output: `email-templates/dist/*.lmx` (gitignored; regenerate any time)
- Push: [`email-templates/push.mjs`](email-templates/push.mjs)

For *when* each email fires and what the app sends with it, see
[LOOPS_EMAILS.md](LOOPS_EMAILS.md).

---

## Everyday use

```bash
# 1. edit the copy in build.mjs, then
node email-templates/build.mjs

# 2. see what would change, without changing it
LOOPS_API_KEY=xxx node email-templates/push.mjs

# 3. do it
LOOPS_API_KEY=xxx node email-templates/push.mjs --apply

# just one or two
LOOPS_API_KEY=xxx node email-templates/push.mjs --apply welcome weekly_summary
```

`push.mjs` is **dry-run by default**. Nothing reaches Loops without `--apply`.

After pushing, **publish each changed Loop in the Loops dashboard** — a pushed
draft isn't live until it's published.

> Get the API key from Loops → Settings → API.
> PowerShell needs it on its own line: `$env:LOOPS_API_KEY="key"`

---

## Why LMX instead of MJML zips

MJML zips had to be uploaded by hand, and Loops kept its own copy, so every copy
edit meant re-uploading ten files. Loops refuses HTML and MJML over the API
[on purpose](https://loops.so/docs/guides/html-emails) — *"we don't believe emails
belong in your codebase"* — but it does accept LMX. Porting to LMX is what makes
these templates pushable.

Two things improved on the way:

- **Subject lines are now code.** A zip carries no subject, so all ten used to be
  hand-typed in the dashboard.
- **The hand-built footer is gone.** Loops appends the postal address and
  unsubscribe link itself.

---

## The 10 emails

| Key | Kind | Subject |
|---|---|---|
| `welcome` | workflow | Welcome to TimetoPay, {contact.firstName} |
| `account_deleted` | workflow | Your TimetoPay account has been deleted |
| `list_export_ready` | workflow | Your shopping list is ready ({event.itemCount} items) |
| `receipt_inactivity` | workflow | {event.headline} |
| `weekly_summary` | workflow | Your grocery week: ${event.total} spent |
| `monthly_summary` | workflow | Your grocery month: ${event.total} spent |
| `preferences_updated` | workflow | Your TimetoPay email preferences were updated |
| `password_reset_required` | workflow | Action needed: reset your TimetoPay password |
| `trip_receipt_missing` | workflow | Did you keep the receipt? |
| `announce_2_0` | **campaign** | TimetoPay is now free |

`announce_2_0` is a one-off broadcast, not event-triggered, so **`push.mjs` skips
it deliberately** — pushing content into a sent campaign is meaningless. To draft
it, use `scripts/src/lmx-preview.mjs`.

### No longer sent

`subscription_started`, `trial_ending`, `payment_past_due` — TimetoPay is free, so
nothing can trigger them. Unpublish those Loops if they still exist.

---

## Variables

LMX **requires a prefix**. Bare `{firstName}` is invalid and renders as literal
text.

| Prefix | Use | Example |
|---|---|---|
| `{contact.x}` | contact property | `{contact.firstName}` |
| `{event.x}` | workflow emails only | `{event.itemCount}` |
| `{data.x}` | transactional only | `{data.message}` |

The app always sends `firstName` as a contact property and everything else as
event properties — verified against the `loopsSendEvent` call sites in
[reminders.ts](artifacts/api-server/src/lib/notifications/reminders.ts),
[transactional.ts](artifacts/api-server/src/lib/email/transactional.ts) and
[me.ts](artifacts/api-server/src/routes/me.ts).

A **campaign has no event payload**, so `{event.x}` cannot resolve there. The
build fails if a campaign template uses one.

**`total`, `previousTotal` and `changeAmount` are raw numbers** — `comparePeriods`
rounds to 2dp and stops. The templates add the `$` themselves, so the LMX reads
`${event.total}`. Without it you'd get `64.12`.

**`changeDirection` is the bare word** `up`, `down` or `flat`.

---

## LMX rules the API enforces

Learned by having it reject things. `build.mjs` checks all of these locally, and
a negative test confirms each check actually fires:

| Rule | Why it bites |
|---|---|
| `lineHeight` is **100–300**, not 1.0–3.0 | Every value was wrong on the first attempt |
| `fontSize` is **12–64** | Kills the "thin bar via a 1px paragraph" trick |
| Images must be **Loops-hosted** | External URLs are refused outright |
| Variables must be prefixed | Otherwise silent literal text |
| No raw HTML escape hatch | LMX only |

Two consequences worth knowing:

- **The accent bar is a thick `<Divider>`.** A `<Section>` wrapping a tiny
  paragraph is impossible given the fontSize floor.
- **Never build lists with `<Br />`.** It gives no vertical gap, and the source
  indentation after each break leaks through as a visible leading space. Use one
  `<Paragraph>` per line with `paddingBottom`.

### The logo

Uploaded once to Loops' CDN and referenced by URL in `build.mjs` (`LOGO`). To
replace it, upload a new asset via `scripts/src/lmx-preview.mjs` and swap the
constant.

---

## How push.mjs finds what to update

No endpoint lists email messages, so the IDs are discovered by walking the graph:

```
GET  /v1/workflows                 every Loop
GET  /v1/workflows/{id}            its nodes
GET  /v1/workflow-nodes/{nodeId}   emailMessageId, for SendEmailAction nodes
POST /v1/email-messages/{id}       write subject + previewText + lmx
```

Templates are matched to workflows **by name** — the workflow name must contain
the template key or one of the `NAME_HINTS` in `push.mjs`. Anything unmatched or
ambiguous is **reported, never guessed**, and the script prints the workflow names
Loops returned so the hints can be corrected.

Updates are optimistically concurrent: it GETs the current `contentRevisionId`
and passes it as `expectedRevisionId`, so a stale write fails with a 409 instead
of silently clobbering a dashboard edit.

> **Editing in the Loops dashboard still works** for a quick typo, but it will be
> overwritten by the next push. For anything you want kept, edit `build.mjs`.
