# One-time Loops setup

The zip versions were deleted from Loops, so the nine Loops need creating once.
After that, all content lives in this repo and is pushed with one command.

## Why you have to click, and I can't

The Loops API can create an empty workflow and can rewrite an existing email's
content, but it **cannot**:

- add an email step to a workflow
- set the trigger event
- publish a workflow

`POST /v1/workflows` only produces a blank trigger plus an exit node, with no way
to specify the event. So the skeletons are a dashboard job. Content is not.

**You build nine skeletons once. I push the content, now and every time after.**

---

## Build these nine

In Loops: **Loops → + New**. For each row: set the trigger to the event name
below, add a single **Send email** step, save.

The email's content and subject **do not matter** — leave them blank or type
anything. They get overwritten on the first push.

| # | Trigger event | Suggested Loop name |
|---|---|---|
| 1 | `welcome` | Welcome |
| 2 | `account_deleted` | Account deleted |
| 3 | `list_export_ready` | Shopping list ready |
| 4 | `receipt_inactivity` | Haven't scanned lately |
| 5 | `weekly_summary` | Weekly spend recap |
| 6 | `monthly_summary` | Monthly spend recap |
| 7 | `preferences_updated` | Preferences updated |
| 8 | `password_reset_required` | Password reset required |
| 9 | `trip_receipt_missing` | Trip receipt missing |

The event names must be **exactly** as written — they're what the app fires, from
`loopsSendEvent` in
[transactional.ts](../artifacts/api-server/src/lib/email/transactional.ts),
[reminders.ts](../artifacts/api-server/src/lib/notifications/reminders.ts) and
[me.ts](../artifacts/api-server/src/routes/me.ts).

The Loop *name* is flexible. `push.mjs` matches on the trigger event first and
only falls back to names.

> `announce_2_0` is **not** in this list. It's a one-off campaign, not a Loop.
> Create it with `node scripts/src/lmx-preview.mjs you@example.com` when you want
> to send it.

---

## Then push the content

```bash
node email-templates/build.mjs
LOOPS_API_KEY=xxx node email-templates/push.mjs            # dry run
LOOPS_API_KEY=xxx node email-templates/push.mjs --apply
```

The dry run lists each template against the Loop it matched, and reports anything
it couldn't match rather than guessing.

## Finally, publish

Each Loop needs **publishing** in the dashboard to go live. There's no API for
that either.

**This is the step that matters most.** An unpublished Loop is a silent no-op:
the app fires the event, Loops accepts it, nothing is delivered, and nothing
errors. If these nine were never built, none of these emails have ever sent.

---

## Sanity check afterwards

Trigger something real and confirm it arrives. The easiest is
`preferences_updated` — change a notification toggle in the app's Account screen.
It's debounced to one per ten minutes.

---

## If a push fails with "MJML format is not supported via API"

An email message that currently holds MJML cannot be read **or** written through
the API. The format is a property of the existing message, and **deleting the
uploaded zip does not reset it** -- the message stays MJML-flavoured forever.

Fix: in that Loop, **delete the email step and add a fresh empty one**. A new
email message is LMX-native, so the push then works. Content does not matter;
it gets overwritten.

This is why a Loop you recreated from scratch pushes fine while one that ever
had a zip uploaded into it does not.
