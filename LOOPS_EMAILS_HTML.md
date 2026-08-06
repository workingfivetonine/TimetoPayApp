# TimetoPay — Loops email templates (MJML upload)

The emails are now **MJML zips uploaded to Loops**, not HTML pasted into the
editor. Source lives in [`email-templates/`](email-templates/), built zips in
`email-templates/dist/`.

For the *copy* of each email (subject lines, body wording, when each one fires),
see [LOOPS_EMAILS.md](LOOPS_EMAILS.md) — that's the content source of truth.
This file covers the **branding and the upload mechanics**.

---

## Brand colours

Derived from the app's light palette in
[`constants/colors.ts`](artifacts/receipt-tracker/constants/colors.ts). Email
clients have no dependable dark-mode support, so these templates use the light
palette only.

| Role | Hex | Comes from |
|---|---|---|
| Brand / buttons / links | `#04576A` | app `primary` |
| Headlines | `#17242B` | app `foreground` |
| Body copy | `#3A4B52` | email-only mid-tone |
| Meta lines (dates) | `#4C6B66` | app `mutedForeground` |
| Footer | `#8FA3A0` | email-only light tint |
| Page background | `#F7F6F9` | app `background` |
| Card | `#FFFFFF` | app `card` |
| Divider | `#E6E4EC` | app `border` |
| Security / attention | `#C13E77` | app `destructive` |

Two tints (`body`, `footer`) are email-only: the app's `mutedForeground` is too
dark for 12px footer text, and its `foreground` too heavy for long body copy.
Everything else maps straight to an app token.

`password_reset_required` is the one email that uses the magenta accent bar
instead of teal — it's a security notice and should not read as marketing.

---

## The 9 emails

Each row is one zip in `email-templates/dist/`. All are **event-triggered** —
the app fires the event name and Loops sends the matching email.

| Event / zip | Fires when | Variables |
|---|---|---|
| `welcome` | New user finishes profile setup | `firstName` |
| `account_deleted` | User deletes their account | *(none)* |
| `list_export_ready` | User has items on their list | `firstName`, `itemCount` |
| `receipt_inactivity` | No receipt added in a while | `firstName`, `headline`, `body` |
| `weekly_summary` | Start of each week | `firstName`, `periodStart`, `periodEnd`, `total`, `previousTotal`, `changeAmount`, `changeDirection` |
| `monthly_summary` | Start of each month | same as weekly |
| `preferences_updated` | Email settings changed (debounced 10 min) | `firstName` |
| `password_reset_required` | Admin forces a password reset | `firstName` |
| `trip_receipt_missing` | A week after a Shopping Mode trip with no receipt | `firstName`, `itemsPicked`, `daysSince` |

### Plus one campaign (not a Loop)

| Zip | What | Variables |
|---|---|---|
| `announce_2_0` | One-off 2.0 announcement to existing users — free tier, new look, Shopping Mode | `firstName` |

**Send this as a Campaign, not a Loop.** Loops → Campaigns → New, upload the zip,
pick your audience, send once. It is not attached to any event and the app never
fires it.

That distinction changes what variables work: a campaign has **no event payload**,
so only contact properties resolve. `{firstName}` is fine;
`{EVENT_PROPERTY:anything}` would render as literal text. This template
deliberately uses nothing but `{firstName}`.

### No longer sent

`subscription_started`, `trial_ending` and `payment_past_due` are **gone** —
TimetoPay is free, so there is no billing to email about. If those Loops still
exist in the dashboard, unpublish them; nothing will ever trigger them.

---

## Variable syntax — the part that silently breaks

Loops uses **different syntax depending on where the value came from**, and
getting it wrong renders the literal text instead of the value.

| Kind | Syntax | Which of ours |
|---|---|---|
| Contact property | `{firstName}` | **only** `firstName` |
| Event property | `{EVENT_PROPERTY:itemCount}` | everything else |
| Transactional data | `{DATA_VARIABLE:message}` | support relay only |

The app always sends `firstName` as a *contact* property and everything else as
*event* properties — verified against
[`reminders.ts`](artifacts/api-server/src/lib/notifications/reminders.ts),
[`transactional.ts`](artifacts/api-server/src/lib/email/transactional.ts) and
[`me.ts`](artifacts/api-server/src/routes/me.ts). The templates already use the
right form; keep it that way if you edit them.

Two quirks baked into the templates:

- **`total`, `previousTotal` and `changeAmount` are raw numbers**, not formatted
  currency (`comparePeriods` rounds to 2dp and stops there). The templates add
  the `$` themselves — `${EVENT_PROPERTY:total}`. Without it you'd get `64.12`.
- **`changeDirection` is the bare word** `up`, `down` or `flat`, so it reads
  "up $12.50". If you want "Nice — you spent less! 🎉", use a Loops conditional
  block on that value.

---

## Uploading to Loops

Per [Loops' custom email docs](https://loops.so/docs/creating-emails/uploading-custom-email),
the zip must contain `index.mjml` **at the root**, with images in an `img/`
folder that Loops rehosts on upload. Each of our zips is exactly that:

```
index.mjml
img/
  └─ logo.png
```

**The logo is bundled, not linked.** It used to point at
`https://5to9shopping.com/icon-512.png`, which renders as a broken image in most
inboxes — mail clients block remote images until the reader opts in, and Loops
never gets a chance to rehost an absolute URL. Shipping the file inside the zip
means Loops serves it from its own CDN and it just appears.

1. Loops → the Loop for that event → add/edit an Email
2. Choose the **upload custom email** option
3. Upload `email-templates/dist/<event>.zip`
4. Set the Subject from [LOOPS_EMAILS.md](LOOPS_EMAILS.md)
5. **Publish the Loop** — an unpublished Loop is a silent no-op

Every template already contains the `{unsubscribe_link}` tag Loops requires.

> **The failure mode to know:** an event with no matching *published* Loop is a
> silent no-op. The app fires it, Loops accepts it, nothing is delivered, nothing
> errors. "No email arrived" almost always means the Loop isn't published — not
> that the code broke.

---

## Rebuilding after a brand change

Shared chrome (palette, logo, footer, legal line) is defined once at the top of
[`email-templates/build.mjs`](email-templates/build.mjs), so a colour change is
a one-line edit rather than nine.

```bash
node email-templates/build.mjs      # regenerates all 9 templates AND their zips
```

Optional validation:

```bash
npx mjml@4 --validate email-templates/welcome/index.mjml
```

### Editing here does NOT change what Loops sends

Loops keeps its **own copy** of whatever you upload. Changing a template in this
repo — colours, copy, anything — has no effect on live email until you go into
Loops and upload that zip again. There is no API sync, no webhook, and no git
connection between the two.

So the loop is always: edit → `node email-templates/build.mjs` → **manually
re-upload each changed zip**. If you only touched three templates, only those
three need re-uploading.

### Why the zips are written in Node

**Don't re-zip these with `Compress-Archive` or Windows Explorer.** Both
PowerShell 5.1's `Compress-Archive` and .NET Framework's
`ZipFile.CreateFromDirectory` store the entry name as `img\logo.png` with a
**backslash**. The ZIP spec requires forward slashes, and Loops unpacks on
Linux — where a backslash name is read as a single file literally called
`img\logo.png` sitting in the root, not a folder. The MJML's `img/logo.png`
reference then resolves to nothing and the logo breaks, with no error anywhere.

`build.mjs` writes the archives itself for that reason, so entry names are
correct regardless of platform. It also pins a fixed timestamp, so rebuilding an
unchanged template gives a byte-identical zip rather than a phantom diff.
