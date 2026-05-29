export interface ParsedLineItem {
  name: string;
  price: number;
  quantity: number;
  nameUncertain?: boolean;
  priceUncertain?: boolean;
}

export interface ParsedReceiptData {
  storeName: string;
  storeNameUncertain?: boolean;
  purchasedAt: string;
  dateUncertain?: boolean;
  total: number;
  totalUncertain?: boolean;
  lineItems: ParsedLineItem[];
}

let _pendingReceipt: ParsedReceiptData | null = null;
let _pendingImageBase64: string | null = null;

export function setPendingReceipt(data: ParsedReceiptData, imageBase64: string) {
  _pendingReceipt = data;
  _pendingImageBase64 = imageBase64;
}

export function getPendingReceipt(): { receipt: ParsedReceiptData | null; imageBase64: string | null } {
  return { receipt: _pendingReceipt, imageBase64: _pendingImageBase64 };
}

export function clearPendingReceipt() {
  _pendingReceipt = null;
  _pendingImageBase64 = null;
}
