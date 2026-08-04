# TimetoPay — ready-to-paste branded HTML for every email

Each block below is a **complete, standalone HTML email**. In Loops, open the
email editor, choose the **Custom HTML / code** option, and paste the matching
block. All blocks share one branded design: violet accent bar, logo, headline,
body, a real button, and a footer.

**Before pasting, know these 3 things:**
1. **Logo:** the `<img>` points at `https://5to9shopping.com/icon-512.png` (your
   app icon, already public). For a nicer wordmark, upload `logo-lockup.png` to
   Loops, copy its hosted URL, and replace the `src` in each block.
2. **Variables:** `{{ firstName }}`, `{{ total }}`, etc. — after pasting, use
   Loops' **Insert variable** button on those so they map to real fields (or
   confirm Loops renders the `{{ }}` syntax). Set a **default of "there"** for
   `firstName`.
3. **Unsubscribe:** Loops adds its own unsubscribe footer to opt-in emails
   automatically — you don't need to add one.

Brand: violet `#7C3AED`, ink `#18181B`, muted `#6B7280`, font Inter.

**The two unnumbered blocks at the bottom** (`password_reset_required`,
`trip_receipt_missing`) are the ones that **don't exist in Loops yet** — the app
already fires both, so until you build them they're silent no-ops. Build
`password_reset_required` first: an admin can force a reset today, and without it
the user is signed out of every device with no explanation.

`subscription_started`, `trial_ending` and `payment_past_due` were removed —
TimetoPay is free. Unpublish those Loops if you built them.

---

## 1. `welcome`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your grocery prices, tracked automatically.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Welcome to TimetoPay, {{ firstName }} 🛒</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3F3F46;">You're all set to start spending less on groceries. The fastest way to see it work:</p>
<p style="margin:0;font-size:16px;line-height:1.7;color:#3F3F46;">📸 <strong>Scan a receipt</strong> — we pull out every item &amp; price.<br/>📈 <strong>Build price history</strong> — see the best store &amp; price for what you buy.<br/>🛒 <strong>Get a smart shopping list</strong> — built from your purchases.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/scan" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Scan your first receipt →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Happy saving, the TimetoPay team<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 2. `account_deleted`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your account and data have been deleted.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your account has been deleted</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">This confirms your TimetoPay account and data have been deleted, and any active subscription has been cancelled — you won't be billed again. If this wasn't you, or you change your mind, you're always welcome back.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Visit TimetoPay</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Thanks for giving TimetoPay a try.<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 3. `list_export_ready`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Grab the best prices before your next trip.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your shopping list is ready 🛒</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">Hi {{ firstName }}, you've got <strong>{{ itemCount }} items</strong> on your TimetoPay list, with the best store and price for each. You can also download a printable version grouped by store or category.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/shopping" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Open your list →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 4. `receipt_inactivity`
*(The app writes the `headline` + `body` text for this one — use those variables. Set the email Subject in Loops to `{{ headline }}`.)*

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Keep your price history up to date.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">{{ headline }}</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">{{ body }}</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/scan" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Scan a receipt →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 5. `weekly_summary`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your grocery week in review.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your grocery week</h1></td></tr>
<tr><td style="padding:6px 32px 0;font-size:13px;color:#9CA3AF;">{{ periodStart }} – {{ periodEnd }}</td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 6px;font-size:16px;line-height:1.7;color:#3F3F46;">Hi {{ firstName }},</p>
<p style="margin:0;font-size:16px;line-height:1.8;color:#3F3F46;">🧾 <strong>Spent this week:</strong> {{ total }}<br/>📅 <strong>Week before:</strong> {{ previousTotal }}<br/>📈 <strong>Change:</strong> {{ changeDirection }} {{ changeAmount }}</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">See your analytics →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 6. `monthly_summary`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your grocery month in review.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your grocery month</h1></td></tr>
<tr><td style="padding:6px 32px 0;font-size:13px;color:#9CA3AF;">{{ periodStart }} – {{ periodEnd }}</td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 6px;font-size:16px;line-height:1.7;color:#3F3F46;">Hi {{ firstName }},</p>
<p style="margin:0;font-size:16px;line-height:1.8;color:#3F3F46;">🧾 <strong>Spent this month:</strong> {{ total }}<br/>📅 <strong>Month before:</strong> {{ previousTotal }}<br/>📈 <strong>Change:</strong> {{ changeDirection }} {{ changeAmount }}</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">See your analytics →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 7. `preferences_updated`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">A quick confirmation of your changes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your email preferences were updated</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">Hi {{ firstName }}, this is a quick confirmation that your email preferences on TimetoPay were just updated. You can review or change them anytime under Account → Notifications. If you didn't make this change, please reply and let us know.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/account" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Manage preferences →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## `password_reset_required`
**Variables:** `firstName` · **Subject:** Action needed: reset your TimetoPay password

Security email, so it deliberately carries **no reset link and no login token** — the button just opens the sign-in screen, where the user taps *Forgot password* themselves. That makes it harmless if forwarded and useless to a phisher. Don't "improve" it by adding a one-click reset link.

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">You&rsquo;ll be asked for a new password next time you sign in.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Hi {{ firstName }}, action needed on your account</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3F3F46;">For security, an administrator has required a new password on your TimetoPay account. You&rsquo;ve been signed out on all your devices.</p>
<p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#18181B;font-weight:600;">To get back in:</p>
<p style="margin:0;font-size:16px;line-height:1.7;color:#3F3F46;">1. Open TimetoPay and go to the sign-in screen.<br/>2. Tap <strong>Forgot password</strong>.<br/>3. Follow the emailed link to set a new password.</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#6B7280;">We&rsquo;ll never email you a password or ask you to reply with one. If you weren&rsquo;t expecting this, contact us before signing in.</p>
</td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/sign-in" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Go to sign in &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">The TimetoPay team<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## `trip_receipt_missing`
**Variables:** `firstName`, `itemsPicked`, `daysSince` · **Subject:** Did you keep the receipt? 🧾

Both numbers are plain integers, so "1 items" / "1 days" are possible — branch on the value in Loops if you want singular variants.

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your prices only update when the receipt does.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Did you keep the receipt, {{ firstName }}? 🧾</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3F3F46;">You ticked off <strong>{{ itemsPicked }} items</strong> on your last shop {{ daysSince }} days ago &mdash; but we haven&rsquo;t seen the receipt yet.</p>
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">Adding it takes about ten seconds, and it&rsquo;s what keeps the good stuff working: your price history, the best-store suggestions and your spend totals all come from receipts.</p>
<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#6B7280;">Already added it? Then you&rsquo;re all set &mdash; we&rsquo;ll stop asking about this trip.</p>
</td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/scan" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Add that receipt &rarr;</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Happy saving, the TimetoPay team<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

