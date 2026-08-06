# LMX gating experiment — can Loops' own format carry our design?

Rebuilt `welcome` as LMX (`welcome.lmx`) to test whether porting all ten from
MJML to LMX is viable. Porting would let `build.mjs` push templates over the
Loops Content API instead of us re-uploading zips by hand.

**Verdict: yes, with two real changes and one thing that gets better.**

---

## Design parity, element by element

| Current MJML | LMX equivalent | Works? |
|---|---|---|
| Page background `#F7F6F9` | `<Style backgroundColor>` | Yes |
| White card, 600px | `<Style bodyColor>` (600px is the fixed body width) | Yes |
| Card radius 16px + 1px border | `<Style borderRadius borderWidth borderColor>` | Yes |
| Teal accent bar across the top | `<Section blockColor>` with tight padding | Yes, but see caveat 1 |
| Logo, 44px, left, 10px radius | `<Image width align borderRadius>` | Yes, but see caveat 2 |
| Headline 23px/700 `#17242B` | `<Style heading1Color heading1FontSize>` | Yes |
| Body 16px `#3A4B52`, lh 1.6 | `<Style textBase*>` | Yes |
| Bold-label list with `<br />` | `<Strong>` + `<Br />` inside `<Paragraph>` | Yes |
| Button teal/white, 10px radius | `<Style button*>` and/or `<Button bgColor>` | Yes |
| Divider `#E6E4EC` | `<Divider>` + `<Style dividerColor>` | Yes |
| Faint footer `#8FA3A0` | `<Text textColor>` inline | Yes |
| Magenta accent on password-reset | Per-element `<Section blockColor>` / `<Button bgColor>` override | Yes |
| Inter font | `<Style bodyFontFamily>` | Probably — needs eyeballing |

Nothing in the design is impossible. The palette maps cleanly because LMX exposes
per-element colour overrides as well as global ones.

---

## Caveat 1: the accent bar is a hack

`<Section>` needs a child, so a 6px band becomes a Section with tiny padding
wrapping a zero-width-space paragraph. It should render, but it is not clean and
the exact height won't be pixel-identical to the MJML `<mj-spacer height="6px">`.

Acceptable. Worst case the bar is a few pixels off, or we drop it and lean on the
card border instead.

## Caveat 2: the logo must be hosted by Loops

This is the one hard constraint. LMX requires `src` to be **a Loops-hosted
image** — there is no zip, so the bundled-logo trick we just built is dead.

Fix: upload the logo once via `POST /v1/uploads`, then reference the returned URL
in all ten templates. That's a one-time step, and arguably better than shipping a
34KB copy inside every zip. `welcome.lmx` has `LOOPS_HOSTED_LOGO_URL` as a
placeholder for it.

Note this does **not** reintroduce the broken-image problem — a Loops CDN URL is
what Loops was rewriting our `img/logo.png` to anyway.

---

## What gets better

**Variables become explicit.** LMX rejects bare `{firstName}` and requires a
prefix, which removes the whole footgun class we hit earlier:

| Now | LMX |
|---|---|
| `{firstName}` (contact) | `{contact.firstName}` |
| `{EVENT_PROPERTY:total}` (event) | `{event.total}` |
| `{DATA_VARIABLE:message}` (transactional) | `{data.message}` |

The prefix makes the contact/event/transactional distinction impossible to get
wrong. That is exactly the bug that would have silently shipped literal text.

**Subject lines become code.** A zip carries no subject, so all ten are hand-typed
into the dashboard today. `POST /v1/email-messages/{id}` accepts `subject`.

**Less code to maintain.** The hand-rolled ~90-line zip writer goes away, and so
does the hand-built footer block — LMX appends the postal address and unsubscribe
link itself.

---

## What I could NOT verify without pushing to Loops

Being explicit, because these are the reasons to preview before porting all ten:

1. **How it actually renders.** LMX is Loops-proprietary; there is no local
   renderer. The only way to see it is to push it and preview in the dashboard.
2. **Whether the zero-width-space accent bar renders as a clean band.**
3. **Whether `bodyFontFamily="Inter"` resolves**, or silently falls back.
4. **Exact auto-footer wording/placement** — need to confirm it isn't duplicated
   against our signoff line.
5. **Whether `<Section>` truly requires a child**, or accepts self-closing.

## To preview it

Needs a Loops API key and an existing email-message ID:

```bash
npx loops-cli email-messages update <emailMessageId> --force --lmx-file email-templates/_lmx-experiment/welcome.lmx
```

Then open that email in the Loops dashboard. Do this against a **draft or
duplicate**, not the live `welcome` message.

---

## Recommendation

Port. The design survives, the variable syntax gets safer, subject lines come
along, and we delete code. The two caveats are cosmetic and solvable.

But **preview this one template first.** All five unknowns above are answered the
moment you look at it in the dashboard, and none of them can be answered from the
docs.
