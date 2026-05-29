---
name: Item emoji icons
description: How per-item emoji icons are assigned, backfilled, and overridden in the receipt tracker
---
# Item emoji icons

Each item carries a nullable `icon` (emoji string).

- AI returns an `icon` per line item in scan/parse prompts; a keyword→emoji helper (fallback 🛒) assigns icons on NEW items and lazily backfills existing null-icon items whenever they are re-encountered in any ingest route.
- Manual override: an emoji picker on the item detail screen persists the chosen icon.

**Why lazy backfill isn't enough for existing data:** items created before the feature stay on the fallback until re-purchased. After shipping, run a one-time backfill over all null-icon items.
**Tooling gotcha:** tsx is NOT installed and the db lib exports TS source directly, so any throwaway script that imports it must be bundled (esbuild) rather than run with plain node.

**How to apply:**
- Any new ingest route that dedups items must replicate the null-icon backfill, and any response shape carrying item data must include `icon` (keep the OpenAPI schemas in sync).
- When changing an item's icon on the client, invalidate every cache that surfaces item data — including receipt detail, whose keys are per-id (invalidate by string-prefix predicate, not a single key).
