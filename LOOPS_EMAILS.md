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

## 2. Thanks for subscribing — event: `subscription_started`
**Sends when:** a subscription becomes active (Stripe or PayPal).
**Variables:** `firstName`, `plan`

**Subject:** You're in — welcome to TimetoPay Premium 🎉
**Preview:** Unlimited AI scanning is now unlocked.

**Body:**
> Hi {{ firstName }},
>
> Thanks for subscribing to TimetoPay Premium! Your {{ plan }} plan is active.
>
> You now have **unlimited AI receipt scanning**, PDF and multi-receipt uploads, and the full price-history and analytics tools.
>
> [Scan a receipt →](https://5to9shopping.com/scan)
>
> Thank you for supporting TimetoPay 💜

---

## 3. Payment didn't go through — event: `payment_past_due`
**Sends when:** a payment fails (subscription goes past due).
**Variables:** `currentPeriodEnd`

**Subject:** Action needed: your TimetoPay payment didn't go through
**Preview:** Update your payment method to keep Premium.

**Body:**
> Hi {{ firstName }},
>
> We had trouble processing your latest TimetoPay payment, so your Premium access is at risk.
>
> To keep unlimited scanning and your analytics, please update your payment method:
>
> [Update billing →](https://5to9shopping.com/account)
>
> If you've already fixed it, you can ignore this — thanks!

---

## 4. Trial ending — event: `trial_ending`
**Sends when:** the free trial is within ~3 days of ending.
**Variables:** `daysLeft`, `trialEndsAt`, `firstName`

**Subject:** Your TimetoPay trial ends in {{ daysLeft }} days
**Preview:** Subscribe to keep unlimited scanning.

**Body:**
> Hi {{ firstName }},
>
> Heads up — your TimetoPay free trial ends in **{{ daysLeft }} days**.
>
> Don't lose your price history and unlimited scanning. Subscribe now and keep everything running:
>
> [See plans →](https://5to9shopping.com/paywall)
>
> Questions? Just reply — we're happy to help.

---

## 5. Account deleted — event: `account_deleted`
**Sends when:** a user deletes their account.
**Variables:** `subscriptionCancelled` (true/false)

**Subject:** Your TimetoPay account has been deleted
**Preview:** Sorry to see you go.

**Body:**
> Hi,
>
> This confirms your TimetoPay account and data have been deleted.
>
> *(If `subscriptionCancelled` is true, add this line — Loops conditional block, or make a second version:)*
> Your subscription has been cancelled, and you won't be billed again.
>
> If this wasn't you, or you change your mind, you're always welcome back at [5to9shopping.com](https://5to9shopping.com).
>
> Thanks for giving TimetoPay a try.

---

## 6. Shopping-list nudge — event: `list_export_ready`
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

## 7. "Haven't scanned lately" — event: `receipt_inactivity`
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

## 8. Weekly spend recap — event: `weekly_summary`
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

## 9. Monthly spend recap — event: `monthly_summary`
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
Do the high-impact ones first, then the rest:
1. `welcome`
2. `trial_ending`
3. `payment_past_due`
4. `subscription_started`
5. Support transactional
6. `account_deleted`, `list_export_ready`, `receipt_inactivity`, `weekly_summary`, `monthly_summary`

## Before they'll actually send
- `LOOPS_API_KEY` set in Railway ✅
- Your sending domain verified in Loops
- Each Loop **published** (toggled live)
- Old `RESEND_*` variables removed from Railway
