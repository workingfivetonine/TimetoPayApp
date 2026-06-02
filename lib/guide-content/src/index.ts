/**
 * Single source of truth for the TimetoPay how-to guide content.
 *
 * This data drives BOTH:
 *  - the in-app Help screen (`artifacts/receipt-tracker/app/help.tsx`)
 *  - the offline guide artifacts (`docs/guide/Receipt-Tracker-Guide.{md,pdf}` and the
 *    bundled copy at `artifacts/receipt-tracker/assets/guide/Receipt-Tracker-Guide.pdf`),
 *    regenerated via `pnpm --filter @workspace/scripts run generate-guide`.
 *
 * Keep copy/screenshot changes here so the two never drift apart.
 */

/**
 * Feather icon name used by the in-app guide cards. Typed as a plain string here
 * so this module stays free of React Native / `@expo/vector-icons` dependencies;
 * `help.tsx` casts it to the Feather icon name type.
 */
export type GuideIcon = string;

export interface GuideSectionContent {
  /** Feather icon shown on the in-app card. */
  icon: GuideIcon;
  /** Section heading. */
  title: string;
  /** Short introductory paragraph. */
  intro: string;
  /** Ordered list of how-to steps. */
  steps: string[];
  /**
   * Screenshot file name (lives in `artifacts/receipt-tracker/assets/images/guide/`).
   * Optional — admin sections may be documented without a screenshot, in which
   * case the card/PDF renders text-only.
   */
  imageFile?: string;
}

export const GUIDE_TITLE = "TimetoPay — How-to Guide";

export const GUIDE_TAGLINE =
  "Scan receipts, track prices over time, and let your shopping list build itself. This guide walks through every part of TimetoPay with screenshots from the app.";

export const GUIDE_FOOTER =
  "Generated for TimetoPay. Screenshots reflect the live app with demo data.";

export const GUIDE_ADMIN_TITLE = "TimetoPay — Admin Guide";

export const GUIDE_ADMIN_TAGLINE =
  "Administrator-only reference for TimetoPay. These tools are visible only to the master admin and cover the cross-user catalog, user management, billing oversight, and global pricing. Keep this document restricted to administrators.";

export const GUIDE_ADMIN_FOOTER =
  "Generated for TimetoPay administrators. Admin tools appear only for the master admin account.";

export const GUIDE_SECTIONS: GuideSectionContent[] = [
  {
    icon: "log-in",
    title: "Signing in",
    intro:
      "TimetoPay keeps each person's data private, so you start by signing in. Your receipts, stores, and prices are only ever visible to your own account.",
    steps: [
      "Enter your email and password, then tap Sign in.",
      "New here? Tap Sign up to create an account in a few seconds.",
      "You can sign out any time from the Account screen to switch accounts.",
    ],
    imageFile: "sign-in.jpg",
  },
  {
    icon: "file-text",
    title: "Your receipts",
    intro:
      "The Receipts tab is your home base — every receipt you scan or enter shows up here, newest first, with the store and total.",
    steps: [
      "Tap any receipt to open it and see the individual line items.",
      "The total on the right is calculated from the items on that receipt.",
      "Use the search box and Sort control at the top to find or reorder your receipts.",
      "Use the trash icon to remove a receipt you no longer need.",
    ],
    imageFile: "receipts.jpg",
  },
  {
    icon: "list",
    title: "Receipt details",
    intro:
      "Open a receipt to review what was bought. This is where you fix anything the scanner misread.",
    steps: [
      "Tap the pencil on a line to edit its name or price.",
      "Tap the × to delete a single item from the receipt.",
      "Each item carries an emoji and feeds your price history automatically.",
    ],
    imageFile: "receipt-detail.jpg",
  },
  {
    icon: "camera",
    title: "Adding a receipt",
    intro:
      "Tap Scan (or Add Receipt) to capture a new purchase. AI reads the store, items, and prices for you.",
    steps: [
      "Choose Photo to snap or upload a paper receipt — the AI extracts everything.",
      "Upload PDF works best for online order confirmations.",
      "Prefer to type? Use Enter Manually for a full receipt or Log Items for a quick list.",
    ],
    imageFile: "scan.jpg",
  },
  {
    icon: "check-circle",
    title: "Review & save a scan",
    intro:
      "After the AI reads a photo or PDF, you land on the Review screen to confirm everything before it's saved. Anything the AI wasn't sure about is highlighted in amber.",
    steps: [
      "Check the store, date, and total at the top, then fix any highlighted fields.",
      "Edit item names, prices, and quantities; remove a line with the trash icon or add one with Add Item.",
      "Tap Confirm & Save to file the receipt and update your prices and shopping list.",
    ],
    imageFile: "review-receipt.jpg",
  },
  {
    icon: "edit-3",
    title: "Enter a receipt manually",
    intro:
      "No photo? Choose Enter Manually to type a full receipt yourself — handy for cash purchases or older receipts.",
    steps: [
      "Fill in the store details and the receipt date, time, and totals.",
      "Add each item with its name, price, and quantity using Add Item.",
      "Tap Save to file it just like a scanned receipt.",
    ],
    imageFile: "manual-entry.jpg",
  },
  {
    icon: "plus-square",
    title: "Quickly log items",
    intro:
      "Log Items is the fastest way to jot down a few things — just a store, a date, and a short list. The total adds itself up as you go.",
    steps: [
      "Start typing a store name and pick from the suggestions, or enter a new one.",
      "Add each item with its price and quantity; the running total updates live.",
      "Tap Save to turn the list into a receipt.",
    ],
    imageFile: "quick-add.jpg",
  },
  {
    icon: "shopping-bag",
    title: "Stores",
    intro:
      "The Stores tab keeps the places you shop, along with delivery fees and minimum-order details.",
    steps: [
      "Tap + to add a store, or the pencil to edit one.",
      "Record delivery fee and minimum order to power the cost-benefit analysis.",
      "Tap a store card to open its detail screen.",
    ],
    imageFile: "stores.jpg",
  },
  {
    icon: "truck",
    title: "Store cost-benefit",
    intro:
      "Each store's detail screen shows how much you spend there and whether delivery is worth it.",
    steps: [
      "See total spent, average receipt, and number of visits at a glance.",
      "The delivery box tells you what percentage the fee adds to a typical order.",
      "Browse every item you've ever bought at that store.",
    ],
    imageFile: "store-detail.jpg",
  },
  {
    icon: "trending-up",
    title: "Item price history",
    intro:
      "Tap any item to track its price over time and see which store gave you the best deal.",
    steps: [
      "Lowest, average, and highest prices are summarized up top.",
      "The price trend chart plots every purchase you've logged.",
      "Tap the emoji to change it, or use Delete Item to remove it everywhere.",
    ],
    imageFile: "item-detail.jpg",
  },
  {
    icon: "check-square",
    title: "Shopping list",
    intro:
      "Your list builds itself from what you buy. Regulars are things you've purchased 2+ times; One-offs are the rest.",
    steps: [
      "Each item shows its lowest price, the best store, and how much you save.",
      "Mark something Ran Out to bump it back to the top of your list.",
      "Use the download button in the header to export a printable PDF grouped by store.",
    ],
    imageFile: "shopping.jpg",
  },
  {
    icon: "bar-chart-2",
    title: "Spending analytics",
    intro:
      "The Analytics tab turns your receipts into spending insights so you can spot trends.",
    steps: [
      "The calendar heatmap shades each day by how much you spent.",
      "Switch to Weekly to see spend per week with high/low flags.",
      "The Items view breaks down price history item by item.",
    ],
    imageFile: "analytics.jpg",
  },
  {
    icon: "grid",
    title: "Browse catalog",
    intro:
      "Open Browse Catalog from the Shopping List header to see typical prices for items that multiple shoppers have bought, grouped by category.",
    steps: [
      "Tap the + (check) button to add any item to your own shopping list.",
      "Items already on your list appear checked.",
      "You only ever see prices for items several shoppers have bought — never who bought them.",
    ],
    imageFile: "catalog.jpg",
  },
  {
    icon: "user",
    title: "Your account",
    intro:
      "The Account screen shows who you're signed in as and lets you sign out.",
    steps: [
      "Confirm the email tied to your data.",
      "Everything you scan stays private to your account.",
      "Sign out here to switch accounts.",
    ],
    imageFile: "account.jpg",
  },
];

/**
 * Admin-only guide sections. These document the master-admin tools and are
 * shipped as a SEPARATE offline PDF (`Receipt-Tracker-Admin-Guide.pdf`) and
 * only rendered in the in-app Help screen for admins. Sections without an
 * `imageFile` render text-only.
 */
export const GUIDE_ADMIN_SECTIONS: GuideSectionContent[] = [
  {
    icon: "shield",
    title: "Admin tools overview",
    intro:
      "Admin features are visible only to the master admin account. When you're signed in as the admin, four extra links appear at the bottom of the Account screen: All users, Subscriptions, Global prices, and Manage catalog. Everything below lives behind those links.",
    steps: [
      "Open the Account screen and scroll to the admin links at the bottom.",
      "These links (and the data behind them) never appear for regular users.",
      "Cross-user data is read-only except for the catalog and user-management actions described below.",
    ],
  },
  {
    icon: "users",
    title: "All users",
    intro:
      "The All users screen is a directory of every account, showing each user's receipt count, store visits, items tracked, and lifetime spend so you can spot active or inactive accounts at a glance.",
    steps: [
      "Use the search bar to filter the list by email address.",
      "Scan the Receipts / Stores / Items stats on each card to gauge engagement.",
      "Tap any user card to open their detailed management screen.",
    ],
  },
  {
    icon: "user-check",
    title: "User management",
    intro:
      "Opening a user shows their full receipt history plus the controls to manage that account: change their role, merge them into another account, or delete them entirely. Destructive actions ask for confirmation.",
    steps: [
      "Change the role between Master admin, Family, or General — promoting to Master admin transfers admin rights in one step and asks you to confirm.",
      "Use “Merge into another user” to move all of this account's receipts, stores, and items into a target account, then remove the source.",
      "Use Delete user in the danger zone to permanently remove the account and all its data.",
    ],
  },
  {
    icon: "edit",
    title: "Manage catalog",
    intro:
      "The Manage catalog screen keeps the shared product and store database clean. Switch between the Items and Stores tabs to rename, merge, split, categorize, and brand the canonical entries every user's prices roll up into.",
    steps: [
      "Tap “Suggest categories” to let AI bulk-assign departments to uncategorized items, then accept or reject each suggestion.",
      "Tap “Find duplicates” to have AI group near-identical names; accept a group to merge it into one canonical entry (the non-AI matcher also flags obvious duplicates automatically).",
      "On the Stores tab, edit a store to upload a logo or add a website — both then show on the store's detail screen for every user.",
    ],
    imageFile: "admin-catalog.jpg",
  },
  {
    icon: "trending-up",
    title: "Global prices",
    intro:
      "Global prices is a cross-user market view of the most recent price recorded for every catalog item, so you can track variance and inflation across stores. It shows aggregates only — never who bought what.",
    steps: [
      "Tap an item card to expand a ranked list of prices from every store it's been scanned at.",
      "The “Lowest” badge marks the cheapest store for that item.",
      "Sort by A–Z, Price, or Recent to surface the data you need.",
    ],
    imageFile: "admin-global.jpg",
  },
  {
    icon: "credit-card",
    title: "Subscriptions",
    intro:
      "The Subscriptions screen tracks billing and entitlement across the user base — who's on a free trial, who's actively paying via Stripe or PayPal, and whose payment is past due — so premium access stays correct.",
    steps: [
      "Read the color-coded status badges (e.g. red for Past due, gold for Free trial) to spot billing issues.",
      "Check the Access column to confirm whether the backend currently grants premium features.",
      "Open a card's Period section to see when a trial ends or a subscription renews.",
    ],
  },
];
