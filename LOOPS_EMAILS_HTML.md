# TimetoPay — ready-to-paste branded HTML for all 10 emails

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

## 2. `subscription_started`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Unlimited AI scanning is now unlocked.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">You're in — welcome to Premium 🎉</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#3F3F46;">Thanks for subscribing, {{ firstName }}! Your {{ plan }} plan is active.</p>
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">You now have <strong>unlimited AI receipt scanning</strong>, PDF &amp; multi-receipt uploads, and the full price-history and analytics tools.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/scan" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Scan a receipt →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Thank you for supporting TimetoPay 💜<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 3. `trial_ending`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Subscribe to keep unlimited scanning.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#7C3AED;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your trial ends in {{ daysLeft }} days</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">Hi {{ firstName }}, heads up — your TimetoPay free trial is ending soon. Subscribe now to keep your price history, unlimited scanning, and analytics running without interruption.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#7C3AED" style="border-radius:10px;"><a href="https://5to9shopping.com/paywall" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">See plans →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Questions? Just reply — we're happy to help.<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 4. `payment_past_due`

```html
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F4F4F7;font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Update your payment method to keep Premium.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="height:6px;background:#DC2626;font-size:6px;line-height:6px;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 32px 4px;"><img src="https://5to9shopping.com/icon-512.png" width="44" height="44" alt="TimetoPay" style="border-radius:10px;display:block;border:0;"/></td></tr>
<tr><td style="padding:16px 32px 0;"><h1 style="margin:0;font-size:23px;line-height:1.3;color:#18181B;font-weight:700;">Your payment didn't go through</h1></td></tr>
<tr><td style="padding:14px 32px 0;">
<p style="margin:0;font-size:16px;line-height:1.6;color:#3F3F46;">Hi {{ firstName }}, we had trouble processing your latest TimetoPay payment, so your Premium access is at risk. Please update your payment method to keep unlimited scanning and your analytics.</p></td></tr>
<tr><td align="center" style="padding:26px 32px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#DC2626" style="border-radius:10px;"><a href="https://5to9shopping.com/account" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fff;text-decoration:none;">Update billing →</a></td></tr></table></td></tr>
<tr><td style="padding:22px 32px 0;"><div style="border-top:1px solid #ECECEF;font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:14px 32px 30px;font-size:12px;line-height:1.5;color:#B4B4BB;">Already fixed it? You can ignore this — thanks!<br/>FivetoNine LLC · 483 Chestnut Street, Cedarhurst, NY 11518 · <a href="https://5to9shopping.com" style="color:#9CA3AF;">5to9shopping.com</a></td></tr>
</table></td></tr></table></body></html>
```

---

## 5. `account_deleted`

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

## 6. `list_export_ready`

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

## 7. `receipt_inactivity`
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

## 8. `weekly_summary`

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

## 9. `monthly_summary`

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

## 10. `preferences_updated`

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
