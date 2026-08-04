# Scan pipeline release: 10+ page PDFs, post-save editing, camera capture, image zoom, email-in receipts

## Context (overall)

This started as one ask (handle 10+ page PDF uploads) and grew, mid-planning, into ten related asks
about the scan/review experience:
1. Multi-page PDF splitting + merge (10+ pages, up from 4).
2. Editing the store name post-save (it's editable pre-save today, but not after).
3. In-app camera capture (today the app can only pick existing photos from the library).
4. Expanding/zooming the small receipt-photo thumbnail shown during review.
5. Emailing a receipt to a per-user address for automatic scan-and-upload (confirmed: full
   auto-pipeline, not a manual relay).
6. Store-name autocomplete/dropdown when editing a scanned receipt's store (reuse an existing pattern).
7. Smarter item matching against the user's own purchase history at that store, so scanned line items
   land on an existing item instead of creating near-duplicates that need merging later.
8. "Save and Next" / "Save and Close" buttons on the post-scan review screen.
9. Capturing tax and discounts as their own receipt-level fields instead of discarding them.
10. OS-level "Share to" TimetoPay support from the Photos/Files apps.

Items 1-4 and 6-9 are scoped in detail below as one implementation pass (they touch the same
screens/files). Item 5 (email-in) is a materially larger, separate piece of new infrastructure (inbound
email receiving) scoped at an architecture level with a recommended provider, flagged for its own
follow-up build. Item 10 (share-to-app) is also somewhat separate in kind — it needs a native
config-plugin + rebuild (can't be tested in Expo Go/web) — but is small enough in scope to include here
as its own section, clearly flagged for device-build testing.

Separately, two asks about the **shopping list "Download"/"Create List" flow** came in — an unrelated
subsystem to the receipt-scanning work above: (11) rename "Download" to "Create List," add "select/
deselect all," move the custom-item field to the top, and clarify what's actually achievable for
"export with active checkboxes" to Notes/Keep; and (12) a "Shopping Mode" feature the user explicitly
said belongs in a **later, separate release** — noted here at a high level only, not scoped in detail.

## Context (PDF multi-page)

Free/premium users can already upload a scanned PDF of receipts; today it's hard-capped at 4 pages
(`PDF_MAX_PAGES = 4` in `artifacts/api-server/src/routes/receipts.ts`), and pages beyond the cap are
silently dropped — the user gets no indication anything was skipped. The user wants to raise this to
handle bulk uploads (10+ pages), and asked whether to (a) try to auto-detect receipt boundaries via
date-recognition, or (b) treat every page as its own receipt and let the user merge afterward.

Decision (confirmed with user): **keep model (b)** — every page is scanned as its own candidate
receipt, no auto-grouping heuristic. This matches the architecture that's already ~90% built: the
`parse-pdf` endpoint already persists one receipt per page and the client already routes multi-receipt
results to a "batch review" screen with an existing merge action (`POST /receipts/merge`). Auto-detecting
"is this page a continuation of the previous receipt" was judged too fragile (unreliable on receipts
that print the date once, or not on continuation pages) for the reliability this needs.

The two gaps to close are: the hard 4-page cap (and the silent truncation when a PDF has more pages
than that), and the batch-review screen's lack of line-item editing (today it's summary cards + merge
only — confirmed by user as worth fixing in this same pass, since once pages are split independently
per-page, a user will often need to move/fix individual line items before merging, not just merge whole
receipts).

## Current architecture (confirmed by reading the code)

- `artifacts/api-server/src/routes/receipts.ts`, `POST /parse-pdf` (~1146-1274): PDF → temp file →
  page count via `pdfinfo`/`pdf-parse` → **sequential `for` loop**, one page at a time: rasterize via
  `renderPdfToImages()` (~109-174, poppler `pdftoppm`, DPI/width/band-capped), one `gpt-5.2` vision call
  per page (no `Promise.all` — pages are processed strictly in order), `findDuplicate()` check, then
  `persistParsedReceipt()` — each page becomes its own saved DB receipt immediately (not staged). Results
  return as saved-receipt summaries (or `isDuplicate` markers), never full editable data.
- Constants (lines ~42-65): `PDF_MAX_PAGES = 4`, `MAX_PDF_B64_CHARS = 15 * 1024 * 1024` (~11MB decoded),
  `MAX_RENDER_IMAGES = 8` (per-page band cap, not a cross-page cap — `renderPdfToImages` is called once
  per page with `onlyPage` set), `PDFTOPPM_TIMEOUT_MS = 25_000` (per subprocess call).
  `pdfGuard` (~176-196, via `aiAbuseGuard`): 6 req/min, 100/day, 1 concurrent per user, 4 global.
  Global Express body cap: `express.json({ limit: "20mb" })` / `urlencoded` in `artifacts/api-server/src/app.ts:60-61`.
- **Silent truncation bug**: `pageCount = Math.min(dims.pages, PDF_MAX_PAGES)` (and the `pdf-parse`
  fallback, which is itself called with `{ max: PDF_MAX_PAGES }`) — the true page count is never kept
  around, so there's no way today to tell the client "your PDF had 14 pages, only 4 were processed."
- Client: `artifacts/receipt-tracker/app/scan.tsx`, `parsePdf()` (~428-481) — calls `parse-pdf`, splits
  results into `saved` vs duplicates, routes to `/receipt/:id` if exactly one new receipt, else stores
  lightweight summaries (`toSummary()`) into `stores/batchReceipts.ts` and routes to `/batch-review`.
- `artifacts/receipt-tracker/app/batch-review.tsx` (289 lines): plain `ScrollView` of summary cards
  (store/date/total/item-count), checkboxes, "Merge selected" → `POST /receipts/merge`. Tapping a card
  navigates away to `/receipt/:id`. **No line-item editing on this screen itself.**
- `artifacts/api-server/src/routes/receipts.ts`, `POST /merge` (~393-499): unchanged by this plan —
  already does what's needed (earliest-purchased receipt wins, line items reassigned, totals summed,
  sources deleted, all in one transaction with row locks).
- `artifacts/receipt-tracker/app/receipt/[id].tsx` **already has full line-item editing** — this is the
  piece to extract and reuse, not rebuild:
  - `openEdit(li)` / `editingItem` state + a `Modal` with name/price/qty/unit fields.
  - `handleSaveItemEdit()` (~110-157): calls `useUpdateItem()` (catalog name/notes) **and** a raw
    `PATCH /api/receipts/line-items/:id` fetch (price/quantity/unit — "newer than the generated
    client", per its own comment) — then invalidates `getGetReceiptQueryKey`, `getGetShoppingListQueryKey`,
    `getGetSpendAnalyticsQueryKey`, `getGetDailySpendQueryKey`, `getListItemsQueryKey`.
  - `commitDeleteLineItem()`/`handleDeleteLineItem()` (~159-180ish): `useDeleteLineItem()` mutation with
    an undo-timer pattern (`pendingDeleteLiId`, `undoTimerRef`).
  - `ParsedReceiptData`/`stores/pendingReceipt.ts` (used by the *single-photo* pre-save review flow,
    `review-receipt.tsx`) is a **single-slot singleton for not-yet-saved data** — structurally different
    from the batch path, which works on already-persisted DB rows by id. Do **not** try to reuse
    `review-receipt.tsx`/`pendingReceipt.ts` for this — build on the already-saved-row model instead,
    since `parse-pdf` already saves each page before the client sees it.

## Plan

### 1. Backend: raise the page cap and stop the silent truncation

File: `artifacts/api-server/src/routes/receipts.ts`

- `PDF_MAX_PAGES`: `4` → `10`.
- Capture the *true* page count separately from the capped one:
  ```ts
  const totalPages = dims?.pages ?? numpagesFallback ?? 1; // whatever the uncapped source reports
  const pageCount = Math.min(totalPages, PDF_MAX_PAGES);
  const pagesSkipped = Math.max(0, totalPages - pageCount);
  ```
  (For the `pdf-parse` fallback branch, call it *without* `{ max: PDF_MAX_PAGES }` so `numpages` reflects
  the real total — it's already only used for the page count, not rendering.)
- Include `pagesSkipped` in the success response: `res.status(201).json({ receipts: results, pagesSkipped })`.
- Raise `MAX_PDF_B64_CHARS` (e.g. to `24 * 1024 * 1024`, ~18MB decoded) so 10 real scanned pages aren't
  rejected by the per-request guard, and raise the global Express body limit in
  `artifacts/api-server/src/app.ts:60-61` from `20mb` to e.g. `28mb` to keep headroom above the new PDF
  cap (both `express.json` and `express.urlencoded`). Pick exact numbers after testing with a real
  multi-page scanned PDF — phone-camera-quality scans can be larger than text-based PDFs.
- Leave `MAX_RENDER_IMAGES` (8) and `PDFTOPPM_TIMEOUT_MS` (25s) as-is — both are scoped per-page, not
  per-PDF, so raising the page count doesn't interact with them directly.
- **Risk to verify, not pre-emptively fix**: the per-page loop is sequential (render → one OpenAI call →
  persist, per page), so worst-case latency roughly scales 2.5x (4→10 pages) — likely 30-90+ seconds for
  a full 10-page PDF depending on OpenAI latency. Test this empirically (see Verification). If it's a
  real UX problem, the safe incremental fix is bounded-concurrency on the **OpenAI call only** (e.g. a
  pool of 3), keeping the render + persist + `findDuplicate` steps sequential per page — because
  `findDuplicate` relies on earlier pages in the *same* request already being persisted to catch
  duplicate pages within one PDF; don't fully parallelize the loop or that check breaks. Don't build
  this speculatively — only do it if the timing test shows it's needed.

### 2. Frontend: surface the truncation warning

File: `artifacts/receipt-tracker/app/scan.tsx`, `parsePdf()` (~428-481)

- Read `pagesSkipped` off the `parse-pdf` response alongside `receipts`.
- If `pagesSkipped > 0`, show an additional toast/alert (reuse existing `showErrorToast`/`showSuccessToast`
  pattern already in this function), e.g. "Only the first 10 pages were processed — N page(s) were
  skipped. Upload the rest as a separate PDF."

### 3. Extract the existing line-item editor into a shared component

Rationale: `receipt/[id].tsx` already has a complete, working edit-item modal + delete-with-undo. Reuse
it rather than re-implementing in `batch-review.tsx`.

- New file, e.g. `artifacts/receipt-tracker/components/LineItemEditModal.tsx` (or a hook +
  presentational modal pair, matching existing component conventions in that folder): lift `editingItem`
  state, the name/price/qty/unit form, `handleSaveItemEdit` (the `useUpdateItem` + raw
  `PATCH /api/receipts/line-items/:id` pair), `useDeleteLineItem` + undo-timer delete flow, and the
  query-invalidation list, out of `receipt/[id].tsx` into this shared piece. Parametrize on `receiptId`
  and the line items array (or accept a `LineItem[]` + a refetch/invalidate callback) so it isn't tied
  to the single-receipt screen's local state.
- Refactor `receipt/[id].tsx` to use the extracted component in place of its inline modal — verify no
  behavior change (same fields, same mutations, same invalidations).

### 4. Add inline line-item editing to `batch-review.tsx`

File: `artifacts/receipt-tracker/app/batch-review.tsx`

- Make each summary card expandable (e.g. a chevron/"Edit items" toggle) that fetches/shows that
  receipt's line items (there's already `useGetReceipt` used elsewhere for this shape) and renders them
  using the new shared `LineItemEditModal` component from step 3 — same edit/delete behavior as the
  full receipt-detail screen, without navigating away.
- Keep the existing "tap card → `/receipt/:id`" as a secondary path for anything not covered inline
  (e.g. viewing the original photo, deleting the whole receipt).
- Not required, but worth a quick check while touching this file: it's currently a plain
  `ScrollView` + `.map` (fine for ~10 cards); no change needed for correctness at this scale, so skip
  converting to `FlatList` unless it turns out to feel janky in manual testing.

## Verification (PDF multi-page + batch editing)

- `pnpm run typecheck:libs && pnpm run typecheck` (repo convention, per `replit.md`).
- Run the API server (`pnpm --filter @workspace/api-server run dev`) and the Expo web client; scan two
  test PDFs via the real scan screen:
  1. A 10-page (or fewer) receipt PDF — confirm all pages produce receipts (minus any genuine
     blanks/duplicates), `batch-review` shows all of them, no `pagesSkipped` warning.
  2. A 12+ page PDF — confirm the truncation toast fires with the right skipped count.
- On `batch-review`, expand a card, edit a line item's price/qty and delete another, confirm it persists
  (cross-check against `/receipt/:id` for the same receipt) and query invalidations refresh shopping
  list / analytics as expected.
- Select 2+ cards and merge; confirm combined total and line items match the existing `POST /merge`
  semantics (earliest-purchased wins, totals summed) — this logic is untouched, just confirming the new
  page volume didn't break anything downstream.
- Time the 10-page scan end-to-end; if it's uncomfortably slow (many tens of seconds), revisit the
  bounded-concurrency note in step 1 rather than shipping a slow/timeout-prone flow.

---

## Store name editing after save

**Current state (confirmed):** Store name is already editable *before* save —
`artifacts/receipt-tracker/app/review-receipt.tsx` renders it as a `TextInput` (~304-320, `setStoreName`
handler ~172-173) and sends the edited value to `POST /api/receipts/save-parsed`. It is **not** editable
after save: `artifacts/receipt-tracker/app/receipt/[id].tsx:236` renders it as plain `<Text>`, no edit
affordance, and `batch-review.tsx` (post-save summary cards) doesn't show it as editable either. There is
also no receipt-level backend endpoint to change it: `receipts.ts` has no `PATCH /:id`; the only store
update route is `PATCH /api/stores/:id` (`stores.ts:210`), which renames the **shared store row** — using
that here would silently rename the store for every other receipt linked to it, which is wrong for "fix
the store name on this one receipt."

**Plan:**
- New backend endpoint, e.g. `PATCH /api/receipts/:id` (or a more specific `PATCH /api/receipts/:id/store`)
  accepting `{ storeName: string }`. Reuse the exact find-or-create pattern already in
  `persistParsedReceipt()` (`receipts.ts` ~857-867: case-insensitive lookup scoped to `userId`, insert if
  missing) to resolve/create the target store, then update this receipt's `storeId` to point at it — do
  **not** touch the old store's row. Wrap in a transaction like the existing `POST /merge` handler.
- Frontend: add an edit affordance next to the store name in `receipt/[id].tsx` (tap-to-edit or an edit
  icon, consistent with the existing line-item edit icon pattern at ~285-290) that calls the new endpoint
  and invalidates the same query keys already invalidated after a line-item edit
  (`getGetReceiptQueryKey`, `getListReceiptsQueryKey`, `getGetShoppingListQueryKey`, spend/analytics keys).
- Extend the same affordance into the batch-review inline editor (step 4 above) so store name can be
  fixed on a per-page receipt before merging — this matters more here than usual, since PDF pages often
  mis-read the store name and the user is already in a "fix these pages" mindset.

**Verification:** rename a store on one receipt via the new UI; confirm only that receipt moved to the
new/renamed store and any other receipts previously on the old store name are unaffected.

---

## In-app camera capture

**Current state (confirmed):** Camera capture doesn't exist anywhere in the app today. `scan.tsx:209-217`
only calls `ImagePicker.launchImageLibraryAsync(...)` — `launchCameraAsync` has zero matches repo-wide.
`expo-camera` is listed in `package.json` and as an Expo plugin in `app.json`, but has no import or usage
anywhere — it's an unused, config-only artifact, not a partially-built feature.

**Plan:** this is simpler than the `expo-camera` dependency suggests — no need to build a custom camera
screen. `expo-image-picker` (already the library in use) has its own `launchCameraAsync()` that handles
permission prompting and returns the same asset shape (`uri`, `base64`, `width`, `height`) as
`launchImageLibraryAsync`, so it drops into the existing `pendingImage` → `ImageEditor` crop flow
unchanged.
- In `scan.tsx`, change the entry point so picking a photo offers two choices — "Take Photo" and "Choose
  from Library" (e.g. an action sheet/`Alert` before opening a picker, similar to the existing "Same
  receipt"/"Different receipts" prompt pattern at ~236-252) — "Take Photo" calls
  `ImagePicker.launchCameraAsync({ base64: true, quality: 1.0 })` (single image only — no multi-select
  from a camera), "Choose from Library" keeps the current `handlePickImage()` call unchanged.
- Camera permission: `launchCameraAsync` prompts automatically if not yet granted, but handle the
  denied-permission case explicitly (show a message pointing to Settings), matching how the app already
  handles a denied library-permission case, if it does — check `handlePickImage`'s error handling for the
  pattern to mirror.

**Verification:** on a real device or simulator with camera support, tap "Take Photo," capture a receipt,
confirm it flows into the same crop → scan → review path as a library-picked photo.

---

## Expand/zoom the receipt photo thumbnail

**Current state (confirmed):** The only place a receipt photo renders as a small thumbnail is
`review-receipt.tsx:290-296` — a plain `72×96` `Image`, no `onPress`, no modal, no zoom.
`receipt/[id].tsx` (post-save) doesn't render the photo at all today, so there's nothing to expand there.
Repo-wide, there's no existing zoomable-image/lightbox component to reuse (`ImageEditor.tsx`'s crop tool
uses `Gesture.Pan()` only, no `Gesture.Pinch()`); `react-native-gesture-handler` and `react-native-
reanimated` are already dependencies, so a pinch-zoom viewer can be built without adding new packages.

**Plan:**
- New shared component, e.g. `artifacts/receipt-tracker/components/ZoomableImageModal.tsx`: a full-screen
  `Modal` with pinch-to-zoom (`Gesture.Pinch()` + `Gesture.Pan()` combined via `Gesture.Simultaneous`,
  reanimated shared values for scale/translation — same libraries `ImageEditor.tsx` already uses) and a
  close button/tap-to-dismiss.
- Wire it to `review-receipt.tsx`'s thumbnail: wrap the `Image` at ~290-296 in a `TouchableOpacity` that
  opens the new modal with the same `imageBase64` data URI.
- Out of scope for now (flag, don't build speculatively): `receipt/[id].tsx` doesn't currently store/
  retrieve the original scan image post-save at all — if the user later wants to view the original photo
  after saving, that needs the image to be persisted server-side first (it isn't today; only the parsed
  data is kept), which is a separate, larger change. This plan only fixes the thumbnail that already
  exists in the pre-save review screen.

**Verification:** scan a receipt, on the review screen tap the thumbnail, confirm it opens full-screen
and pinch-zoom/pan works to read fine print, then dismiss and confirm the review form underneath is
unaffected.

---

## Store-name autocomplete when editing

**Current state (confirmed):** This pattern already exists — `artifacts/receipt-tracker/app/quick-add.tsx`
(lines ~69-75, ~217-265) has a `TextInput` for store name backed by `useListStores()` (from
`GET /api/stores`, already generated as a React Query hook), client-side filtered by substring match
(case-insensitive, capped to 5 suggestions) and rendered as an absolute-positioned suggestion list below
the input; tapping a suggestion fills the field, and free text is still allowed if nothing is picked. This
is a manual TextInput+list pattern, not a native picker — nothing new needs to be built, just reused.
`manual-entry.tsx`'s store field is plain freeform text with no such lookup today.

**Plan:** lift `quick-add.tsx`'s store-dropdown block into a small shared component (e.g.
`components/StoreNameField.tsx`, taking `value`/`onChangeText` props) and use it in place of the plain
`TextInput` in:
- `review-receipt.tsx`'s store name field (~304-320) — pre-save review.
- The new post-save store-name editor in `receipt/[id].tsx` and the batch-review inline editor (both
  added in the "Store name editing after save" section above) — so fixing a misread store name always
  offers existing stores first, reducing accidental near-duplicate store creation.

**Verification:** type a partial existing store name in each of the three places above, confirm the
matching store(s) appear as tappable suggestions, and that picking one fills the field exactly as
`quick-add.tsx` already does.

---

## Smarter item matching against the user's purchase history at that store

**Current state (confirmed):** `persistParsedReceipt()` (`receipts.ts` ~906-927) matches a scanned line
item by **exact, case-insensitive name only** (`LOWER(itemsTable.name) = LOWER(li.name)`) and creates a
new per-user `itemsTable` row on any miss — "MILK 1L" vs "Whole Milk 1L" from the same store become two
separate items today, needing manual cleanup later. Fuzzy-matching logic already exists in this codebase,
but only for the separate, admin-curated global catalog: `artifacts/api-server/src/routes/adminCatalog.ts`
has `levenshtein()` (~85), `similarity()` (~103, edit-distance ratio), `tokenSortKey()` (~76), and
`buildSuggestions()` (~113, union-find clustering at similarity ≥ 0.85), used by the admin
merge/suggest-duplicates endpoints — none of it is wired to the per-user `itemsTable` or to scanning.
`itemsTable` (`lib/db/src/schema/items.ts`) has no alias/canonical-id column. The vision prompt
(`receiptPrompt()`) is never given the user's existing items as context.

**Plan:**
- Extract `levenshtein()`/`similarity()`/`tokenSortKey()` out of `adminCatalog.ts` into a small shared
  util (e.g. `artifacts/api-server/src/lib/textSimilarity.ts`) so both the existing admin-catalog dedup
  and this new path use one implementation instead of two copies.
- In `persistParsedReceipt()`'s item-matching block, when the exact-name lookup misses, add a second
  pass **before** creating a new item: fetch the user's items previously purchased *at this same store*
  (join `lineItemsTable` → `receiptsTable` filtered on `storeId` + `userId`, distinct `itemId`/name — this
  scoping is deliberate and matches the user's ask: match against "past records associated with the
  specific store," not the user's entire item list, so e.g. "Bread" at Store A doesn't get matched to
  a differently-priced/branded "Bread" bought only at Store B), then score each candidate with the
  extracted `similarity()` and pick the best match above a threshold (reuse the existing ≥0.85 convention
  from `adminCatalog.ts`'s clustering). Fall back to today's exact-match-then-create if nothing clears
  the bar.
- Treat prompt-context injection (giving the model the store's known item names so it can name a scanned
  item to match one directly) as an optional follow-on, not required for v1 — the deterministic
  post-processing match above is cheaper and more predictable; adding store-scoped item names into
  `receiptPrompt()`'s per-call context is a reasonable later enhancement once the matching threshold is
  tuned against real data.

**Verification:** scan two receipts from the same store where an item's name varies slightly (e.g. "Coca
Cola 12pk" vs "Coke 12 Pack"), confirm the second scan reuses the same `itemsTable` row (check
`purchaseCount` incremented, no second near-duplicate item created) instead of the current behavior of
creating a new item. Also confirm an item bought under a similar name at a *different* store does **not**
get incorrectly matched, since matching is store-scoped.

---

## "Save and Next" / "Save and Close" on the review screen

**Current state (confirmed):** `review-receipt.tsx` has exactly one button today, "Confirm & Save"
(~517-527) → `handleSave()` (~121) → on success, `router.replace(`/receipt/${saved.id}`)` (~164) — always
lands on the new receipt's detail screen, and there's no shortcut back into scanning another receipt.

**Plan:** replace the single button with two:
- **"Save and Next"** — same `handleSave()` logic, but on success navigate back into the scan entry point
  instead of the receipt detail screen (e.g. `router.replace("/scan?autoOpen=1")`, with `scan.tsx` reading
  that param on mount to immediately re-open the take-photo/choose-library prompt from the "In-app camera
  capture" section above) — lets someone with a stack of paper receipts scan one after another with a
  single tap between each, rather than saving then manually navigating back to the scan tab.
- **"Save and Close"** — same `handleSave()` logic, but on success call `router.back()` to return to
  whatever screen the user was on before starting the scan, instead of always jumping into the new
  receipt's detail view.
- Keep both behind the same validation/error handling `handleSave()` already does (invalid price/date
  checks, offline handling if present) — only the post-success navigation differs between the two.

**Verification:** scan a receipt, tap "Save and Next," confirm it saves and reopens the scan picker
immediately; scan another, tap "Save and Close," confirm it saves and returns to the screen you were on
before scanning (not the receipt detail).

---

## Capture tax and discounts as receipt-level adjustments (not line items)

**Current state (confirmed):** The AI scan prompt (`receiptPrompt()`) currently instructs the model to
**discard** tax and discounts entirely: "Include ONLY purchased product lines — exclude subtotals, taxes,
discounts, delivery fees, tips, loyalty points" (~line 287), with a worked example showing a "Loyalty
discount: -0.50" line explicitly marked "← IGNORE" (~line 224). Only `total` (grand total) and
`deliveryFee` are captured as receipt-level fields from a scan; tax/discount amounts are simply lost —
there's no way today to see "how much tax did I pay" or "what discount did I get" on a scanned receipt.
`receiptsTable` (`lib/db/src/schema/receipts.ts`) already has a `totalBeforeTax` column and a
`deliveryFee` column, but `totalBeforeTax` is only ever populated by the **manual-entry** endpoint
(`POST /manual-entry`, ~1276-1340) where a user types it in directly — never by any AI-scan path. There's
no `discount` column at all. The existing `deliveryFee` field is the closest working precedent: captured
by the AI as a receipt-level number, stored on the receipt, and shown read-only in `receipt/[id].tsx`
(~309-323, a conditional "Delivery / service fee" row above the Total row) and editable pre-save in
`review-receipt.tsx` (~357-365, a numeric field with an uncertain-flag pattern) — the plan below is to
mirror that exact pattern for tax and discount rather than inventing a new one.

**Plan:**
- Schema: add two nullable numeric columns to `receiptsTable` (`lib/db/src/schema/receipts.ts`), matching
  the existing `deliveryFee` column shape: `tax` and `discount` (store discount as a positive magnitude —
  "amount subtracted" — not a negative number, for consistent display/summing). Push via
  `pnpm --filter @workspace/db run push` (repo convention).
- Prompt: update `receiptPrompt()` to extract `tax` (sum of any tax/VAT/GST lines, positive number,
  default 0) and `discount` (sum of any discount/coupon/loyalty-savings lines, positive magnitude,
  default 0) as receipt-level fields — same instruction style already used for `deliveryFee` ("this is
  NOT a line item — never add it to lineItems"). Update the "exclude subtotals, taxes, discounts..."
  instruction so tax/discount are captured as fields instead of fully discarded (subtotals still aren't
  needed since `total` remains authoritative, same as today).
- Thread the new fields through exactly where `deliveryFee` already flows: `ParsedReceiptData`
  (`stores/pendingReceipt.ts`) gets `tax?: number | null` and `discount?: number | null`;
  `persistParsedReceipt()`'s type signature and insert values (`receipts.ts`) add both; all AI-scan call
  sites that already pass `deliveryFee` through (`parse`, `parse-and-save`, `parse-and-save-batch`,
  `save-parsed`, `parse-pdf`) pass the two new fields the same way.
- `POST /merge` (~440-455): extend the existing `combinedBeforeTax`-style summing (currently just for
  `totalBeforeTax`) to also sum `tax` and `discount` across merged receipts, defaulting missing values to
  0 (unlike `totalBeforeTax`'s current "only if every receipt has it" rule — tax/discount being absent on
  one merged page is normal and shouldn't blank out the others).
- UI: `review-receipt.tsx` — add Tax and Discount numeric fields right next to the existing Delivery Fee
  field (~357-365), same optional/uncertain-flag pattern. `receipt/[id].tsx` — add Tax and Discount rows
  to the totals card (~309-323) the same way the conditional Delivery/service-fee row already works
  (only rendered when non-null/non-zero), and make them editable using the same store-name/line-item edit
  affordance style already planned elsewhere in this doc (tap to edit → small inline input → PATCH).
  Regenerate the OpenAPI/generated client (`pnpm --filter @workspace/api-spec run codegen`) so `tax`/
  `discount` land in the generated types properly, rather than needing the "drifted field, read via cast"
  workaround the code currently uses for `deliveryFee`.

**Verification:** scan a receipt with a visible tax line and a discount/coupon line, confirm both show up
as separate fields (not as phantom purchased items in the item list or shopping list), are editable in
review and post-save, and that merging two such receipts sums tax/discount correctly alongside total.

---

## "Share to" TimetoPay from Photos/Files

**Current state (confirmed):** No incoming share-intent capability exists today. The only sharing-related
dependency is `expo-sharing` (`~14.0.8`) — a **share-out** API (e.g. exporting a shopping list PDF), not a
share-target. There's no `expo-share-intent` (or similar) dependency, no `Info.plist`/`AndroidManifest`
intent-filter configuration, and no code anywhere that listens for the app being launched via an OS share
sheet. This is a native-capability gap, not a partially-built feature.

**Plan:**
- Add a community Expo config plugin for share intents (e.g. `expo-share-intent`), configured in
  `app.json`/`app.config` to register TimetoPay as a share target for images and PDFs on both iOS and
  Android. **This requires a native rebuild** (EAS build or a local dev client) — it cannot be tested via
  Expo Go or the web client, since it changes native `Info.plist`/`AndroidManifest.xml` entries.
- App-side: add a listener (the plugin's provided hook, e.g. `useShareIntent()`) that fires when the app
  is opened via a share; read the shared file's URI + mimetype, convert to base64 the same way
  `scan.tsx`'s existing pickers already do, and route it into the existing pipeline based on type — a
  shared image goes through the same path as a picked/captured photo (`pendingImage` → `ImageEditor` crop
  → scan), a shared PDF goes straight to the existing `parsePdf()` call. No changes needed to the parsing
  pipeline itself — this is purely a new entry point feeding the same existing flows.
- Handle the "app not running" cold-start case (share intent received before the app/auth is ready) vs.
  "app already open" case — the chosen plugin's docs will cover both; needs explicit testing on a real
  device build for each.

**Verification:** on a real device (or simulator, for iOS) with a dev-client build installed, share a
receipt photo from the Photos app to TimetoPay, confirm it lands in the crop/scan flow; share a PDF from
Files, confirm it goes through `parsePdf()`. Test both cold-start (app not already running) and warm
(app already open) cases.

---

## Shopping list "Create List" modal (separate feature area from the scan pipeline above)

This is an unrelated subsystem — the shopping-list export flow, not scanning — added mid-plan. Scoped
here as its own block since it touches entirely different files.

**Current state (confirmed):**
- The "Download" button lives in `app/(tabs)/shopping.tsx:236-246` (label "Download", a `Feather
  name="download"` icon) and its `onPress` (`handleOpenPdfModal`, ~193-195) just opens
  `<ShoppingListPdfModal>` — all actual list-building/export logic lives inside that modal, not the main
  shopping screen.
- Selection state is **inside the modal only**: `excluded: Set<number>` (`ShoppingListPdfModal.tsx:123`,
  inverted — an item is checked/included unless its id is in `excluded`), toggled per-item via `toggle(id)`
  (~238-244). **Today everything starts checked/included** (empty `excluded` set on open) — there is no
  "select all" or "deselect all" button anywhere, only per-item toggling and category/store filter pills
  that change what's *shown*, not what's *selected*.
- The custom-item add field (`"Add a custom item"`, ~694-733) sits near the **bottom** of the modal's
  scrollable body, after the Regular and One-off items sections, right before the footer buttons.
- Export has two paths from the modal footer (~736-773): **PDF** (`handleGenerate`, via `expo-print`/
  `lib/shoppingListPdf.ts`'s `buildShoppingListHtml` — a styled print layout, no interactive checkboxes,
  this is just a print-friendly document) and **Share** (`handleShareText`, via `buildTextList()` →
  React Native's `Share.share(...)`, which opens the native OS share sheet — this already lets a user
  pick "Notes"/"Keep"/anything from the share sheet today). The shared text uses a Unicode `☐` glyph per
  line (`buildTextList`, ~342/355), not Markdown `- [ ]` syntax.

**Plan for this release:**
1. Rename "Download" → "Create List": update the button label/accessibility label at
   `shopping.tsx:236-246` (the `handleOpenPdfModal`/modal-opening behavior is unchanged — this is a label
   change only, `ShoppingListPdfModal` itself can also get a header-text pass if it says "Download"
   anywhere internally).
2. Add a "Deselect all" action next to the existing per-item toggles in `ShoppingListPdfModal.tsx` (a
   button that sets `excluded` to the full set of currently-visible item ids) — worth pairing with a
   "Select all" action too (clears `excluded`) since neither exists today, only one was explicitly asked
   for but they're the same few lines and belong together as a pair.
3. Move the "Add a custom item" block (~694-733) from the bottom of the modal's scroll body to the top,
   above the Regular/One-off sections — pure JSX reordering, no state changes needed since `customItems`
   is already independent of section rendering order.
4. **Export to Notes app with "active" checkboxes — flagging a real technical constraint before
   committing to it:** the existing Share button already hands the list to the OS share sheet, so a user
   can already pick Apple Notes / Google Keep / any Notes app today — but neither Apple Notes nor generic
   Android note apps (Keep, Samsung Notes, etc.) parse an incoming shared plain-text payload into their
   own *interactive/tappable* checklist items; there's no public, standardized "shared text → native
   checklist" convention those apps honor from a third-party share sheet, regardless of whether the text
   uses `☐`, Markdown `- [ ]`, or anything else — this isn't something fixable by changing the exported
   string format. The genuinely interactive path exists only on iOS, and only for **Reminders** (not
   Notes): Apple's `EventKit` framework lets an app create real, tappable-checkbox reminder items
   directly (no share-sheet round-trip) — that would need a native module + Reminders permission, is
   iOS-only, and is a materially bigger lift than a text/format tweak. Recommend: keep the existing
   Share-sheet text export as the practical "send to Notes" path (maybe make the glyph choice a small
   improvement, e.g. confirm `☐` renders consistently, but treat that as cosmetic), and treat true native
   checklist integration (EventKit/Reminders on iOS; no equivalent standard exists on Android) as a
   separate, bigger, iOS-only follow-up if still wanted once this constraint is understood.

**Verification (this release):** open "Create List," confirm the button says that instead of "Download";
tap "Deselect all," confirm every item unchecks; tap "Select all," confirm every item rechecks; confirm
the custom-item input now appears above the Regular/One-off sections; run the existing Share flow and
confirm it's unchanged (still opens the OS share sheet with the ☐-prefixed text).

---

## Shopping Mode (explicitly called out by the user as a SEPARATE, later release)

Described by the user: a new "Activate Shopping Mode" button next to "Create List," disabled until at
least one item is checked (this mode's own check state starts empty/unselected — **not** the same
selection state as the "Create List" modal's `excluded` set, which today starts all-checked; these are
two different selection concepts and should not be conflated/reused as one state). Once activated, it
shows only the checked-off items with empty checkboxes (a focused "shopping trip" view). When closed, it
triggers (a) an in-app pop-up reminder to upload the receipt, and (b) a follow-up reminder email a week
later if the receipt hasn't been uploaded.

**Not designed in detail here** — per the user's own framing this is for a separate release, and it has
open questions worth resolving closer to that build rather than guessing now: where does this toggle live
relative to the existing per-item Ran Out/Buy More actions on the main shopping screen (`shopping.tsx`,
not the modal) versus inside the "Create List" modal; how is "closed" detected (explicit close button vs.
navigating away); and the week-later email reminder needs a new scheduled-reminder type alongside the
existing 4 subscription-related reminder types already sent via the Resend-connector reminder system
(`REMINDER_INTERVAL_MS` cadence, per `replit.md`) — worth reusing that existing cadence/cursor
infrastructure rather than building a second one. Flagging now so it's on the record for the next
planning pass, not scoping file-by-file yet.

---

## Email-in receipts (architecture-level scope — larger follow-up, not folded into the above)

Confirmed direction: full auto-pipeline — each user gets a unique forwarding address; the app receives
the email automatically, verifies the sender, and scans/saves any attachments, with no manual admin step.

**Why this is architecturally bigger than the other three items:** everything above changes existing
screens/endpoints. This requires a new *inbound* channel into the system — today the app has no mechanism
to receive email at all (the existing `Resend`/`Loops`-based email code, per
`artifacts/api-server/src/lib/email/`, is outbound-only: transactional sends triggered by app events).
Standing up inbound email needs a provider that can receive mail and hand it to the app as a webhook
(e.g. Postmark Inbound, SendGrid Inbound Parse, Mailgun Routes, or Cloudflare Email Routing + Worker),
which in turn needs a domain/subdomain with MX records pointed at that provider — this is an
infrastructure/DNS decision, not just code, so treat the provider choice below as a recommendation to
confirm, not a locked decision.

**Recommended shape:**
1. **Receiving:** a dedicated subdomain (e.g. `receipts.timetopay.app` or similar) with MX records
   pointed at an inbound-email provider (Postmark Inbound is a reasonable default: simple webhook payload,
   already gives per-message SPF/DKIM pass-fail and a spam score, no separate sending-domain warm-up
   needed since this channel never sends). This is a one-time DNS/account setup step outside the codebase.
2. **Per-user address:** generate a stable, opaque per-user token (e.g. `u_<random>`) at signup or on
   first request, store it on the user record, and expose the resulting address
   (`u_<token>@receipts.timetopay.app`) in Account settings so users know where to forward receipts.
3. **Inbound webhook route:** new endpoint, e.g. `POST /api/email-intake/inbound`, that:
   - Authenticates the request came from the provider (shared secret / signature header, per whatever
     provider is chosen — don't skip this, it's the only thing stopping anyone from POSTing fake receipts).
   - Looks up the target user by the token in the recipient address.
   - **Verifies the sender**: compares the email's `From` address against the user's registered/verified
     email (Clerk), and/or an explicit "trusted senders" list the user maintains in Account settings (for
     forwarding from a different personal address) — reject/quarantine anything that doesn't match rather
     than silently trusting the `From` header, which is trivially spoofable without this check.
   - Extracts PDF/image attachments from the parsed payload.
   - Feeds each attachment through the **existing** parse pipeline — reuse `persistParsedReceipt()` and
     the per-page PDF rendering logic from `parse-pdf`/`parse-and-save` (refactor the shared parsing core
     out of the route handler into a plain function callable from both the authenticated HTTP route and
     this webhook, rather than duplicating the OpenAI-call/persist logic).
   - Applies the same abuse guards conceptually (`aiAbuseGuard`-style per-user rate/size limits), since
     this is a new unauthenticated-by-definition entry point into paid AI usage.
4. **Feedback loop:** since there's no in-app UI turn for this path, send a confirmation/failure email
   back to the user (reuse existing transactional email plumbing) — e.g. "3 receipts added from your
   email" or "we couldn't read the attached file."

**Recommendation:** scope this as its own follow-up build (own PR/testing cycle) after items 1-4 ship,
given the DNS/provider setup and security-review needs (spoofing, abuse, a new unauthenticated attack
surface) are meaningfully different in kind from the UI/endpoint work above. Confirm the provider choice
and domain before starting.
