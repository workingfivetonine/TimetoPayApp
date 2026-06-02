# TimetoPay — Admin Guide

> Administrator-only reference for TimetoPay. These tools are visible only to the master admin and cover the cross-user catalog, user management, billing oversight, and global pricing. Keep this document restricted to administrators.

---

## 1. Admin tools overview

Admin features are visible only to the master admin account. When you're signed in as the admin, four extra links appear at the bottom of the Account screen: All users, Subscriptions, Global prices, and Manage catalog. Everything below lives behind those links.

- Open the Account screen and scroll to the admin links at the bottom.
- These links (and the data behind them) never appear for regular users.
- Cross-user data is read-only except for the catalog and user-management actions described below.

## 2. All users

The All users screen is a directory of every account, showing each user's receipt count, store visits, items tracked, and lifetime spend so you can spot active or inactive accounts at a glance.

- Use the search bar to filter the list by email address.
- Scan the Receipts / Stores / Items stats on each card to gauge engagement.
- Tap any user card to open their detailed management screen.

## 3. User management

Opening a user shows their full receipt history plus the controls to manage that account: change their role, merge them into another account, or delete them entirely. Destructive actions ask for confirmation.

- Change the role between Master admin, Family, or General — promoting to Master admin transfers admin rights in one step and asks you to confirm.
- Use “Merge into another user” to move all of this account's receipts, stores, and items into a target account, then remove the source.
- Use Delete user in the danger zone to permanently remove the account and all its data.

## 4. Manage catalog

The Manage catalog screen keeps the shared product and store database clean. Switch between the Items and Stores tabs to rename, merge, split, categorize, and brand the canonical entries every user's prices roll up into.

<img src="images/admin-catalog.jpg" width="280" alt="Manage catalog" />

- Tap “Suggest categories” to let AI bulk-assign departments to uncategorized items, then accept or reject each suggestion.
- Tap “Find duplicates” to have AI group near-identical names; accept a group to merge it into one canonical entry (the non-AI matcher also flags obvious duplicates automatically).
- On the Stores tab, edit a store to upload a logo or add a website — both then show on the store's detail screen for every user.

## 5. Global prices

Global prices is a cross-user market view of the most recent price recorded for every catalog item, so you can track variance and inflation across stores. It shows aggregates only — never who bought what.

<img src="images/admin-global.jpg" width="280" alt="Global prices" />

- Tap an item card to expand a ranked list of prices from every store it's been scanned at.
- The “Lowest” badge marks the cheapest store for that item.
- Sort by A–Z, Price, or Recent to surface the data you need.

## 6. Subscriptions

The Subscriptions screen tracks billing and entitlement across the user base — who's on a free trial, who's actively paying via Stripe or PayPal, and whose payment is past due — so premium access stays correct.

- Read the color-coded status badges (e.g. red for Past due, gold for Free trial) to spot billing issues.
- Check the Access column to confirm whether the backend currently grants premium features.
- Open a card's Period section to see when a trial ends or a subscription renews.

---

_Generated for TimetoPay administrators. Admin tools appear only for the master admin account._
