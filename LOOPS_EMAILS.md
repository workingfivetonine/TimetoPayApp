# Loops email pack — TimetoPay

Paste-ready copy for every email your app sends through Loops. For each one:
**create a Loop** (Loops → Loops → + New) triggered by the **Event** name shown,
add an **Email**, then paste the **Subject** and **Body**.

### How to use the variables
Wherever you see `{{ something }}`, use Loops' **Insert variable / personalization**
button and pick the matching field — don't hand-type the braces unless Loops
shows that syntax. The field names below match exactly what the app sends.
**Tip:** set a fallback for `firstName` (e.g. default to "there") so the greeting
still reads well if a name is missing.

All emails send from your verified Loops domain, so branding is automatic — just
match your logo/colors once in Loops' brand settings.

---

## 1. Welcome — event: `welcome`
**Sends when:** a new user finishes setting up their profile.
**Variables:** `firstName`

**Subject:** Welcome to TimetoPay, {{ firstName }} 🛒
**Preview:** Your grocery prices, tracked automatically.

**Body:**
> Hi {{ firstName }},
>
> Welcome to TimetoPay! You're all set to start spending less on groceries.
>
> Here's the quickest way to see the magic:
> 1. **Scan a receipt** — snap a photo and we'll pull out every item and price.
> 2. **Watch your price history build** — we'll show you the best store and price for the things you buy often.
> 3. **Build a smarter shopping list** — automatically, from what you actually buy.
>
> [Scan your first receipt →](https://5to9shopping.com/scan)
>
> Happy saving,
> The TimetoPay team

---

## 2. Account deleted — event: `account_deleted`
**Sends when:** a user deletes their account.
**Variables:** none

**Subject:** Your TimetoPay account has been deleted
**Preview:** Sorry to see you go.

**Body:**
> Hi,
>
> This confirms your TimetoPay account and data have been deleted.
>
> If this wasn't you, or you change your mind, you're always welcome back at [5to9shopping.com](https://5to9shopping.com).
>
> Thanks for giving TimetoPay a try.

---

## 3. Shopping-list nudge — event: `list_export_ready`
**Sends when:** the user has items on their list (weekly/monthly per their setting).
**Variables:** `itemCount`, `firstName`

**Subject:** Your shopping list is ready ({{ itemCount }} items) 🛒
**Preview:** Grab the best prices before your next trip.

**Body:**
> Hi {{ firstName }},
>
> You've got **{{ itemCount }} items** on your TimetoPay shopping list, with the best store and price for each.
>
> [Open your list →](https://5to9shopping.com/shopping)
>
> Tip: you can download a printable version grouped by store or category.

---

## 4. "Haven't scanned lately" — event: `receipt_inactivity`
**Sends when:** the user hasn't added a receipt in a while.
**Variables:** `headline`, `body`, `daysSinceLastReceipt` (the app writes friendly copy into `headline` + `body`)

**Subject:** {{ headline }}
**Preview:** Keep your price history up to date.

**Body:**
> Hi {{ firstName }},
>
> {{ body }}
>
> [Scan a receipt →](https://5to9shopping.com/scan)

*(This one is special: the app generates the `headline` and `body` text for you, so just drop those variables in.)*

---

## 5. Weekly spend recap — event: `weekly_summary`
**Sends when:** the start of each week, recapping the week just finished.
**Variables:** `periodStart`, `periodEnd`, `total`, `previousTotal`, `changeAmount`, `changeDirection` (up/down/flat), `firstName`

**Subject:** Your grocery week: {{ total }} spent
**Preview:** {{ periodStart }} – {{ periodEnd }}

**Body:**
> Hi {{ firstName }},
>
> Here's your grocery recap for **{{ periodStart }} – {{ periodEnd }}**:
>
> - **Spent this week:** {{ total }}
> - **Week before:** {{ previousTotal }}
> - **Change:** {{ changeDirection }} {{ changeAmount }}
>
> [See your full analytics →](https://5to9shopping.com)
>
> *(Optional polish: use Loops conditional blocks on `changeDirection` to say "Nice — you spent less! 🎉" for `down` vs "Spending crept up this week" for `up`.)*

---

## 6. Monthly spend recap — event: `monthly_summary`
**Sends when:** the start of each month, recapping the month just finished.
**Variables:** same as weekly (`periodStart`, `periodEnd`, `total`, `previousTotal`, `changeAmount`, `changeDirection`, `firstName`)

**Subject:** Your grocery month: {{ total }} spent
**Preview:** {{ periodStart }} – {{ periodEnd }}

**Body:** *(same structure as the weekly recap, just "month" instead of "week")*
> Hi {{ firstName }},
>
> Your grocery recap for **{{ periodStart }} – {{ periodEnd }}**:
>
> - **Spent this month:** {{ total }}
> - **Month before:** {{ previousTotal }}
> - **Change:** {{ changeDirection }} {{ changeAmount }}
>
> [See your full analytics →](https://5to9shopping.com)

---

## 7. Email preferences updated — event: `preferences_updated`
**Sends when:** a user changes their email/notification settings (debounced to at
most one per 10 minutes, so flipping several toggles sends a single email).
**Variables:** `firstName`

**Subject:** Your TimetoPay email preferences were updated
**Preview:** A quick confirmation of your changes.

**Body:**
> Hi {{ firstName }},
>
> This is a quick confirmation that your email preferences on TimetoPay were just updated.
>
> You can review or change them anytime under **Account → Notifications**:
>
> [Manage preferences →](https://5to9shopping.com/account)
>
> If you didn't make this change, please reply and let us know.

---

## Password reset required — event: `password_reset_required`
**Sends when:** an admin forces a password reset on the user's account. Fired only
after Clerk accepts the reset, so it can't arrive if the reset didn't happen.
**Variables:** `firstName`

Deliberately carries **no reset link and no login token** — it points at the
app's own "Forgot password" flow instead. That means the email is safe even if it's
forwarded, and there's nothing in it worth phishing.

**Subject:** Action needed: reset your TimetoPay password
**Preview:** You'll be asked for a new password next time you sign in.

**Body:**
> Hi {{ firstName }},
>
> For security, an administrator has required a new password on your TimetoPay account. You've been signed out on all your devices.
>
> **To get back in:**
> 1. Open TimetoPay and go to the sign-in screen.
> 2. Tap **Forgot password**.
> 3. Follow the emailed link to set a new password.
>
> [Go to sign in →](https://5to9shopping.com/sign-in)
>
> We'll never email you a password or ask you to reply with one. If you weren't expecting this, contact us before signing in.
>
> The TimetoPay team

*(If the account signs in with Google there's no password to reset — they can just
sign in again. Worth a line in the Loop if you want to cover it.)*

---

## Receipt missing after a shop — event: `trip_receipt_missing`
**Sends when:** a week after the user finishes a trip in Shopping Mode without
logging a receipt since. Once per trip, so a weekly shopper gets one nudge per
missed trip rather than a monthly scold.
**Variables:** `firstName`, `itemsPicked`, `daysSince`

**Subject:** Did you keep the receipt? 🧾
**Preview:** Your prices only update when the receipt does.

**Body:**
> Hi {{ firstName }},
>
> You ticked off **{{ itemsPicked }} items** on your last shop {{ daysSince }} days ago — but we haven't seen the receipt yet.
>
> Adding it takes about ten seconds and it's what keeps the good stuff working: your price history, the best-store suggestions, and your spend totals all come from receipts.
>
> [Add that receipt →](https://5to9shopping.com/scan)
>
> Already added it somewhere else? Then you're all set — we'll stop asking.

*(Both `itemsPicked` and `daysSince` are numbers, so "1 items" and "1 days" are
possible. If Loops lets you branch on the value, a singular variant reads better.)*

---

## Transactional (not a Loop) — Support relay
Create this under **Loops → Transactional** (not Loops/automations). It sends to
your support inbox when someone submits the in-app support form. Copy its
**Transactional ID** into Railway as `LOOPS_TRANSACTIONAL_SUPPORT_ID` (already done).
**Data variables:** `type`, `fromEmail`, `userId`, `message`

**Subject:** [TimetoPay] {{ type }} from {{ fromEmail }}

**Body:**
> **{{ type }}** from {{ fromEmail }}
> User ID: {{ userId }}
>
> {{ message }}

*(Optional) Admin digest — only if you set `LOOPS_TRANSACTIONAL_ADMIN_DIGEST_ID`. Data variables: `subject`, `body`. Subject: `{{ subject }}`; Body: `{{ body }}`.*

---

## Build order (suggested)
The two at the top don't exist yet and the app is already firing them, so they're
currently silent no-ops — build these first:
1. **`password_reset_required`** — an admin can already force a reset today, and
   without this the user is signed out with no explanation.
2. **`trip_receipt_missing`** — fires a week after any Shopping Mode trip.
3. `welcome`
4. Support transactional
5. `account_deleted`, `list_export_ready`, `receipt_inactivity`, `weekly_summary`,
   `monthly_summary`, `preferences_updated`

## Before they'll actually send
- `LOOPS_API_KEY` set in Railway ✅
- Your sending domain verified in Loops
- Each Loop **published** (toggled live)

**The failure mode to know about:** an event with no matching Loop in the dashboard
is a **silent no-op**. The app fires it, Loops accepts it, nothing is delivered and
nothing errors. So "no email arrived" almost always means the Loop doesn't exist or
isn't published — not that the code is broken.

## No longer sent
`subscription_started`, `trial_ending` and `payment_past_due` are **gone** —
TimetoPay is free, so there's no billing to email anyone about. If you already
built those Loops, unpublish them; they'll never be triggered again.
