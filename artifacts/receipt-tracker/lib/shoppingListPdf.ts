import { Platform } from "react-native";
import * as Print from "expo-print";
import type { ShoppingListItem } from "@workspace/api-client-react";

const UNKNOWN_STORE = "Other";
const UNKNOWN_CATEGORY = "Other";

type PdfItem = {
  itemName: string;
  icon: string | null;
  category: string;
  storeName: string;
  ranOutAt: string | null;
  isCustom: boolean;
};

type CategoryGroup = {
  category: string;
  items: PdfItem[];
};

type StoreGroup = {
  store: string;
  categories: CategoryGroup[];
};

export interface ShoppingListPdfOptions {
  /** The curated set of real shopping-list items the user chose to include. */
  items: ShoppingListItem[];
  /** PDF-only custom item names typed in the review prompt. Not persisted. */
  customItems?: string[];
  /** Display name for the "Prepared For:" line (full name, falling back to email). */
  preparedFor?: string | null;
}

function toPdfItems(
  items: ShoppingListItem[],
  customItems: string[],
): PdfItem[] {
  const out: PdfItem[] = items.map((item) => ({
    itemName: item.itemName,
    icon: item.icon ?? null,
    category: item.category?.trim() || UNKNOWN_CATEGORY,
    storeName: item.recommendedStoreName?.trim() || UNKNOWN_STORE,
    ranOutAt: item.ranOutAt ?? null,
    isCustom: false,
  }));

  for (const name of customItems) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    out.push({
      itemName: trimmed,
      icon: null,
      category: UNKNOWN_CATEGORY,
      storeName: UNKNOWN_STORE,
      ranOutAt: null,
      isCustom: true,
    });
  }

  return out;
}

function groupByStoreAndCategory(items: PdfItem[]): StoreGroup[] {
  const storeMap = new Map<string, Map<string, PdfItem[]>>();

  for (const item of items) {
    let catMap = storeMap.get(item.storeName);
    if (!catMap) {
      catMap = new Map();
      storeMap.set(item.storeName, catMap);
    }
    let bucket = catMap.get(item.category);
    if (!bucket) {
      bucket = [];
      catMap.set(item.category, bucket);
    }
    bucket.push(item);
  }

  const sortKeepingOtherLast = (a: string, b: string): number => {
    if (a === UNKNOWN_STORE && b !== UNKNOWN_STORE) return 1;
    if (b === UNKNOWN_STORE && a !== UNKNOWN_STORE) return -1;
    return a.localeCompare(b);
  };

  const groups: StoreGroup[] = Array.from(storeMap.entries())
    .sort((a, b) => sortKeepingOtherLast(a[0], b[0]))
    .map(([store, catMap]) => ({
      store,
      categories: Array.from(catMap.entries())
        .sort((a, b) => sortKeepingOtherLast(a[0], b[0]))
        .map(([category, bucket]) => ({
          category,
          items: bucket
            .slice()
            .sort((x, y) => x.itemName.localeCompare(y.itemName)),
        })),
    }));

  return groups;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function renderItem(item: PdfItem): string {
  const icon = escapeHtml(item.icon || "🛒");
  const name = escapeHtml(item.itemName);
  const ranOut = item.ranOutAt != null;
  const ranOutDate = ranOut ? formatDate(item.ranOutAt as string) : "";
  const ranOutTag = ranOut
    ? `<span class="ranout-tag">ran out${
        ranOutDate ? ` · ${escapeHtml(ranOutDate)}` : ""
      }</span>`
    : "";
  const customTag = item.isCustom
    ? `<span class="custom-tag">added</span>`
    : "";
  const nameClass = ranOut ? "item-name ranout" : "item-name";
  return `
    <li class="item">
      <span class="checkbox"></span>
      <span class="item-icon">${icon}</span>
      <span class="item-main">
        <span class="${nameClass}">${name}</span>
        ${ranOutTag}${customTag}
      </span>
    </li>`;
}

function renderCategory(group: CategoryGroup): string {
  return `
    <div class="category">
      <div class="category-title">${escapeHtml(group.category)} <span class="count">${group.items.length}</span></div>
      <ul class="item-list">
        ${group.items.map(renderItem).join("")}
      </ul>
    </div>`;
}

function renderStore(group: StoreGroup): string {
  return `
    <section class="store">
      <h2 class="store-name">${escapeHtml(group.store)}</h2>
      ${group.categories.map(renderCategory).join("")}
    </section>`;
}

export function buildShoppingListHtml(opts: ShoppingListPdfOptions): string {
  const customItems = opts.customItems ?? [];
  const pdfItems = toPdfItems(opts.items, customItems);
  const groups = groupByStoreAndCategory(pdfItems);
  const totalItems = pdfItems.length;
  const preparedFor = (opts.preparedFor ?? "").trim();
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = groups.length
    ? groups.map(renderStore).join("")
    : `<p class="empty">No items selected for this shopping list.</p>`;

  const preparedForLine = preparedFor
    ? `<div class="prepared">Prepared For: <strong>${escapeHtml(preparedFor)}</strong></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 32px 28px 40px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    border-bottom: 3px solid #7c3aed;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .title {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
    color: #0f172a;
  }
  .prepared {
    font-size: 14px;
    color: #334155;
    margin-top: 8px;
  }
  .prepared strong { color: #6d28d9; }
  .meta {
    font-size: 12px;
    color: #64748b;
    margin-top: 4px;
  }
  .layout {
    display: flex;
    align-items: stretch;
    gap: 20px;
  }
  .main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .notes-col {
    flex: 0 0 190px;
    border-left: 1px solid #e2e8f0;
    padding-left: 16px;
  }
  .notes-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #6d28d9;
    margin-bottom: 10px;
  }
  .notes-lines {
    min-height: 920px;
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 31px,
      #cbd5e1 31px,
      #cbd5e1 32px
    );
  }
  .store {
    margin-bottom: 18px;
    page-break-inside: avoid;
  }
  .store-name {
    font-size: 18px;
    font-weight: 700;
    color: #6d28d9;
    background: #ede9fe;
    padding: 7px 12px;
    border-radius: 8px;
    margin: 0 0 10px;
  }
  .category { margin: 0 0 12px; padding-left: 2px; }
  .category-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    margin-bottom: 6px;
  }
  .category-title .count {
    color: #94a3b8;
    font-weight: 600;
  }
  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    display: flex;
    align-items: center;
    padding: 7px 4px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 14px;
  }
  .checkbox {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    border: 1.5px solid #64748b;
    border-radius: 3px;
    margin-right: 12px;
  }
  .item-icon {
    flex: 0 0 auto;
    margin-right: 8px;
    font-size: 15px;
  }
  .item-main {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
  }
  .item-name {
    color: #0f172a;
  }
  .item-name.ranout {
    font-style: italic;
    color: #64748b;
  }
  .ranout-tag {
    display: inline-block;
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #dc2626;
    background: #fef2f2;
    border-radius: 4px;
    padding: 1px 6px;
    margin-left: 8px;
    vertical-align: middle;
  }
  .custom-tag {
    display: inline-block;
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #6d28d9;
    background: #ede9fe;
    border-radius: 4px;
    padding: 1px 6px;
    margin-left: 8px;
    vertical-align: middle;
  }
  .empty { color: #64748b; font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    <h1 class="title">Shopping List</h1>
    ${preparedForLine}
    <div class="meta">${dateStr} · ${totalItems} item${totalItems !== 1 ? "s" : ""}</div>
  </div>
  <div class="layout">
    <div class="main">
      ${body}
    </div>
    <div class="notes-col">
      <div class="notes-title">Notes</div>
      <div class="notes-lines"></div>
    </div>
  </div>
</body>
</html>`;
}

// On web, expo-print's printAsync is just `window.print()` — it ignores the
// supplied html and prints the CURRENT page (the app screen), which is why the
// export looked like a screen grab. Instead we render the generated html into a
// hidden iframe and print THAT document, so the user gets the clean list PDF.
function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Printing is not available."));
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    // NOTE: deliberately NOT visibility:hidden / display:none — some browsers
    // skip rendering (and thus printing) a non-visible iframe, producing a blank
    // page. Keeping it 0x0 and pinned off-screen hides it while still printing.
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      // Defer removal so the print dialog has fully grabbed the document.
      setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* noop */
        }
      }, 500);
    };

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!win || !doc) {
      iframe.remove();
      reject(new Error("Could not prepare the document for printing."));
      return;
    }

    const doPrint = () => {
      try {
        win.focus();
        win.onafterprint = cleanup;
        win.print();
        // Fallback cleanup for browsers that don't fire afterprint.
        setTimeout(cleanup, 60000);
        resolve();
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Printing failed."));
      }
    };

    doc.open();
    doc.write(html);
    doc.close();

    if (doc.readyState === "complete") {
      setTimeout(doPrint, 250);
    } else {
      iframe.onload = () => setTimeout(doPrint, 250);
    }
  });
}

export async function downloadShoppingListPdf(
  opts: ShoppingListPdfOptions,
): Promise<void> {
  const html = buildShoppingListHtml(opts);

  if (Platform.OS === "web") {
    // Print the generated html (not the app screen) so the user can save it as PDF.
    await printHtmlOnWeb(html);
    return;
  }

  // printToFileAsync on Android captures the current screen instead of
  // rendering the supplied HTML. printAsync opens the system print dialog
  // which renders the HTML template correctly; the user saves to PDF from there.
  await Print.printAsync({ html });
}
