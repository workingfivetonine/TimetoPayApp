import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { ShoppingListItem } from "@workspace/api-client-react";

type StoreGroup = {
  store: string;
  regulars: ShoppingListItem[];
  oneOffs: ShoppingListItem[];
};

const UNKNOWN_STORE = "Other";

function groupByStore(
  recurring: ShoppingListItem[],
  oneOff: ShoppingListItem[]
): StoreGroup[] {
  const map = new Map<string, StoreGroup>();

  const ensure = (store: string): StoreGroup => {
    let group = map.get(store);
    if (!group) {
      group = { store, regulars: [], oneOffs: [] };
      map.set(store, group);
    }
    return group;
  };

  for (const item of recurring) {
    ensure(item.recommendedStoreName || UNKNOWN_STORE).regulars.push(item);
  }
  for (const item of oneOff) {
    ensure(item.recommendedStoreName || UNKNOWN_STORE).oneOffs.push(item);
  }

  const groups = Array.from(map.values());
  // Sort stores alphabetically, but push the "Other" bucket to the end.
  groups.sort((a, b) => {
    if (a.store === UNKNOWN_STORE) return 1;
    if (b.store === UNKNOWN_STORE) return -1;
    return a.store.localeCompare(b.store);
  });
  // Sort items within each group alphabetically.
  for (const g of groups) {
    g.regulars.sort((a, b) => a.itemName.localeCompare(b.itemName));
    g.oneOffs.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }
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

function formatPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

function renderItem(item: ShoppingListItem): string {
  const ranOut = item.ranOutAt != null;
  const icon = escapeHtml(item.icon || "🛒");
  const name = escapeHtml(item.itemName);
  const notes = item.notes ? `<span class="item-notes">${escapeHtml(item.notes)}</span>` : "";
  const ranOutTag = ranOut ? `<span class="ranout-tag">ran out</span>` : "";
  const catalogTag =
    item.priceSource === "global" ? `<span class="catalog-tag">catalog</span>` : "";
  const nameClass = ranOut ? "item-name ranout" : "item-name";
  const priceHtml =
    item.recommendedPrice != null
      ? `<span class="item-price">${formatPrice(item.recommendedPrice)}</span>`
      : `<span class="item-avg">no price yet</span>`;
  const avgHtml =
    item.averagePrice != null
      ? `<span class="item-avg">avg ${formatPrice(item.averagePrice)}</span>`
      : "";
  return `
    <li class="item">
      <span class="checkbox"></span>
      <span class="item-icon">${icon}</span>
      <span class="item-main">
        <span class="${nameClass}">${name}${ranOutTag}${catalogTag}</span>
        ${notes}
      </span>
      <span class="item-pricing">
        ${priceHtml}
        ${avgHtml}
      </span>
    </li>`;
}

function renderSubsection(label: string, items: ShoppingListItem[]): string {
  if (items.length === 0) return "";
  return `
    <div class="subsection">
      <div class="subsection-title">${label} <span class="count">${items.length}</span></div>
      <ul class="item-list">
        ${items.map(renderItem).join("")}
      </ul>
    </div>`;
}

function renderStore(group: StoreGroup): string {
  return `
    <section class="store">
      <h2 class="store-name">${escapeHtml(group.store)}</h2>
      ${renderSubsection("Regulars", group.regulars)}
      ${renderSubsection("One-offs", group.oneOffs)}
    </section>`;
}

export function buildShoppingListHtml(
  recurring: ShoppingListItem[],
  oneOff: ShoppingListItem[]
): string {
  const groups = groupByStore(recurring, oneOff);
  const totalItems = recurring.length + oneOff.length;
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = groups.length
    ? groups.map(renderStore).join("")
    : `<p class="empty">No items on your shopping list.</p>`;

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
    margin-bottom: 24px;
  }
  .title {
    font-size: 26px;
    font-weight: 700;
    margin: 0;
    color: #0f172a;
  }
  .meta {
    font-size: 12px;
    color: #64748b;
    margin-top: 6px;
  }
  .store {
    margin-bottom: 22px;
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
  .subsection { margin: 0 0 12px; padding-left: 2px; }
  .subsection-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    margin-bottom: 6px;
  }
  .subsection-title .count {
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
    width: 15px;
    height: 15px;
    border: 1.5px solid #94a3b8;
    border-radius: 4px;
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
    flex-direction: column;
    min-width: 0;
  }
  .item-name {
    color: #0f172a;
  }
  .item-name.ranout {
    font-style: italic;
    color: #64748b;
  }
  .item-notes {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 1px;
  }
  .item-pricing {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: 12px;
  }
  .item-avg {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 400;
    margin-top: 1px;
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
  .catalog-tag {
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
  .item-price {
    flex: 0 0 auto;
    font-weight: 600;
    color: #7c3aed;
    margin-left: 12px;
  }
  .empty { color: #64748b; font-size: 14px; }
</style>
</head>
<body>
  <div class="header">
    <h1 class="title">Shopping List</h1>
    <div class="meta">${dateStr} · ${totalItems} item${totalItems !== 1 ? "s" : ""}</div>
  </div>
  ${body}
</body>
</html>`;
}

export async function downloadShoppingListPdf(
  recurring: ShoppingListItem[],
  oneOff: ShoppingListItem[]
): Promise<void> {
  const html = buildShoppingListHtml(recurring, oneOff);

  if (Platform.OS === "web") {
    // On web, open the system print dialog (user can save as PDF).
    await Print.printAsync({ html });
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Shopping List",
    UTI: "com.adobe.pdf",
  });
}
