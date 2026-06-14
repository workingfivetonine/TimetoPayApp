import { Platform } from "react-native";
import * as Print from "expo-print";
import type { ShoppingListItem } from "@workspace/api-client-react";

export type PriceMode = "lowest" | "recent";

const UNKNOWN_CATEGORY = "Other";

type PdfItem = {
  itemName: string;
  icon: string | null;
  category: string;
  storeName: string | null;
  price: number | null;
  ranOutAt: string | null;
  isCustom: boolean;
  quantity: number;
};

type CategoryGroup = {
  category: string;
  items: PdfItem[];
};

type SectionGroup = {
  title: string;
  categories: CategoryGroup[];
};

export interface ShoppingListPdfOptions {
  regularItems: ShoppingListItem[];
  oneOffItems: ShoppingListItem[];
  customItems?: string[];
  preparedFor?: string | null;
  priceMode?: PriceMode;
  quantities?: Record<number, number>;
}

function getPriceAndStore(
  item: ShoppingListItem,
  mode: PriceMode,
): { price: number | null; store: string | null } {
  if (mode === "lowest") {
    return {
      price: item.lowestPrice ?? null,
      store: item.lowestPriceStoreName?.trim() || null,
    };
  }
  return {
    price: item.recommendedPrice ?? null,
    store: item.recommendedStoreName?.trim() || null,
  };
}

function toSectionGroups(
  regularItems: ShoppingListItem[],
  oneOffItems: ShoppingListItem[],
  customItems: string[],
  priceMode: PriceMode,
  quantities: Record<number, number>,
): SectionGroup[] {
  const sections: SectionGroup[] = [];

  const buildCategories = (items: ShoppingListItem[], includeCustom: boolean): CategoryGroup[] => {
    const catMap = new Map<string, PdfItem[]>();

    for (const item of items) {
      const cat = item.category?.trim() || UNKNOWN_CATEGORY;
      const { price, store } = getPriceAndStore(item, priceMode);
      const bucket = catMap.get(cat) ?? [];
      bucket.push({ itemName: item.itemName, icon: item.icon ?? null, category: cat, storeName: store, price, ranOutAt: item.ranOutAt ?? null, isCustom: false, quantity: quantities[item.itemId] ?? 1 });
      catMap.set(cat, bucket);
    }

    if (includeCustom) {
      for (const name of customItems) {
        const n = name.trim();
        if (!n) continue;
        const bucket = catMap.get("Added") ?? [];
        bucket.push({ itemName: n, icon: null, category: "Added", storeName: null, price: null, ranOutAt: null, isCustom: true, quantity: 1 });
        catMap.set("Added", bucket);
      }
    }

    const sortKey = (a: string, b: string) => {
      if (a === "Added") return 1;
      if (b === "Added") return -1;
      if (a === UNKNOWN_CATEGORY) return 1;
      if (b === UNKNOWN_CATEGORY) return -1;
      return a.localeCompare(b);
    };

    return Array.from(catMap.entries())
      .sort((a, b) => sortKey(a[0], b[0]))
      .map(([category, bucket]) => ({
        category,
        items: bucket.sort((a, b) => {
          if (a.ranOutAt && !b.ranOutAt) return -1;
          if (!a.ranOutAt && b.ranOutAt) return 1;
          return a.itemName.localeCompare(b.itemName);
        }),
      }));
  };

  if (regularItems.length > 0 || customItems.length > 0) {
    const cats = buildCategories(regularItems, true);
    if (cats.length > 0) sections.push({ title: "Regular", categories: cats });
  }

  if (oneOffItems.length > 0) {
    const cats = buildCategories(oneOffItems, false);
    if (cats.length > 0) sections.push({ title: "One-Off Items", categories: cats });
  }

  return sections;
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
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(price: number): string {
  return `$${price.toFixed(2)}`;
}

function renderItem(item: PdfItem): string {
  const icon = escapeHtml(item.icon || "🛒");
  const name = escapeHtml(item.itemName);
  const ranOut = item.ranOutAt != null;
  const ranOutDate = ranOut ? formatDate(item.ranOutAt as string) : "";

  const priceStore = [
    item.price != null ? `<span class="item-price">${escapeHtml(formatCurrency(item.price))}</span>` : "",
    item.storeName ? `<span class="item-store">${escapeHtml(item.storeName)}</span>` : "",
  ].filter(Boolean).join('<span class="item-sep">·</span>');

  const tags = [
    ranOut ? `<span class="ranout-tag">ran out${ranOutDate ? ` · ${escapeHtml(ranOutDate)}` : ""}</span>` : "",
    item.isCustom ? `<span class="custom-tag">added</span>` : "",
  ].filter(Boolean).join("");

  const qtyBadge = item.quantity > 1
    ? `<span class="qty-badge">×${item.quantity}</span>`
    : "";

  return `
    <li class="item">
      <span class="checkbox"></span>
      <span class="item-icon">${icon}</span>
      <span class="item-main">
        <span class="item-name${ranOut ? " ranout" : ""}">${name}${qtyBadge}</span>
        ${tags}
        ${priceStore ? `<span class="item-meta">${priceStore}</span>` : ""}
      </span>
    </li>`;
}

function renderCategory(group: CategoryGroup): string {
  return `
    <div class="category">
      <div class="category-title">${escapeHtml(group.category)} <span class="count">${group.items.length}</span></div>
      <ul class="item-list">${group.items.map(renderItem).join("")}</ul>
    </div>`;
}

function renderSection(section: SectionGroup): string {
  return `
    <section class="section">
      <h2 class="section-title">${escapeHtml(section.title)}</h2>
      ${section.categories.map(renderCategory).join("")}
    </section>`;
}

export function buildShoppingListHtml(opts: ShoppingListPdfOptions): string {
  const priceMode = opts.priceMode ?? "lowest";
  const customItems = opts.customItems ?? [];
  const quantities = opts.quantities ?? {};
  const sections = toSectionGroups(opts.regularItems, opts.oneOffItems, customItems, priceMode, quantities);
  const totalItems = opts.regularItems.length + opts.oneOffItems.length + customItems.filter((n) => n.trim()).length;
  const preparedFor = (opts.preparedFor ?? "").trim();
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const priceLabel = priceMode === "lowest" ? "Lowest price" : "Most recent";

  const body = sections.length
    ? sections.map(renderSection).join("")
    : `<p class="empty">No items selected.</p>`;

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
  .header { border-bottom: 3px solid #7c3aed; padding-bottom: 14px; margin-bottom: 20px; }
  .title { font-size: 28px; font-weight: 700; margin: 0; color: #0f172a; }
  .prepared { font-size: 14px; color: #334155; margin-top: 8px; }
  .prepared strong { color: #6d28d9; }
  .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
  .layout { display: flex; align-items: stretch; gap: 20px; }
  .main { flex: 1 1 auto; min-width: 0; }
  .notes-col { flex: 0 0 190px; border-left: 1px solid #e2e8f0; padding-left: 16px; }
  .notes-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #6d28d9; margin-bottom: 10px; }
  .notes-lines { min-height: 920px; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 31px, #cbd5e1 31px, #cbd5e1 32px); }
  .section { margin-bottom: 22px; page-break-inside: avoid; }
  .section-title { font-size: 18px; font-weight: 700; color: #6d28d9; background: #ede9fe; padding: 7px 12px; border-radius: 8px; margin: 0 0 10px; }
  .category { margin: 0 0 12px; padding-left: 2px; }
  .category-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; }
  .category-title .count { color: #94a3b8; font-weight: 600; }
  .item-list { list-style: none; margin: 0; padding: 0; }
  .item { display: flex; align-items: flex-start; padding: 7px 4px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  .checkbox { flex: 0 0 auto; width: 16px; height: 16px; border: 1.5px solid #64748b; border-radius: 3px; margin-right: 12px; margin-top: 2px; }
  .item-icon { flex: 0 0 auto; margin-right: 8px; font-size: 15px; }
  .item-main { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .item-name { color: #0f172a; }
  .item-name.ranout { font-style: italic; color: #64748b; }
  .item-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 1px; }
  .item-price { font-size: 12px; font-weight: 600; color: #15803d; }
  .item-store { font-size: 12px; color: #64748b; }
  .item-sep { font-size: 11px; color: #94a3b8; }
  .ranout-tag { display: inline-block; font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #dc2626; background: #fef2f2; border-radius: 4px; padding: 1px 6px; vertical-align: middle; }
  .custom-tag { display: inline-block; font-style: normal; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #6d28d9; background: #ede9fe; border-radius: 4px; padding: 1px 6px; vertical-align: middle; }
  .qty-badge { display: inline-block; font-style: normal; font-size: 11px; font-weight: 700; color: #6d28d9; margin-left: 5px; vertical-align: middle; }
  .empty { color: #64748b; font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    <h1 class="title">🛒 Shopping List</h1>
    ${preparedFor ? `<div class="prepared">Prepared For: <strong>${escapeHtml(preparedFor)}</strong></div>` : ""}
    <div class="meta">${dateStr} · ${totalItems} item${totalItems !== 1 ? "s" : ""} · ${priceLabel}</div>
  </div>
  <div class="layout">
    <div class="main">${body}</div>
    <div class="notes-col">
      <div class="notes-title">Notes</div>
      <div class="notes-lines"></div>
    </div>
  </div>
</body>
</html>`;
}

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
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => { try { iframe.remove(); } catch { /* noop */ } }, 500);
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

export async function downloadShoppingListPdf(opts: ShoppingListPdfOptions): Promise<void> {
  const html = buildShoppingListHtml(opts);
  if (Platform.OS === "web") {
    await printHtmlOnWeb(html);
    return;
  }
  await Print.printAsync({ html });
}
