// Module-level handoff (same pattern as stores/pendingReceipt.ts) for the
// batch-review screen. When a multi-page PDF or a multi-photo upload produces
// several receipts at once, we stash lightweight summaries here and navigate to
// /batch-review, where the user can merge the ones that belong together.

export interface BatchReceiptSummary {
  id: number;
  storeName: string;
  total: number;
  itemCount: number;
  purchasedAt: string;
  // Small JPEG data URI of the source PDF page, returned by parse-pdf. Held only
  // for this review session — it is never persisted, so it is absent for photo
  // batches and gone once the user leaves the screen.
  previewUri?: string | null;
}

let _batch: BatchReceiptSummary[] = [];

export function setBatchReceipts(receipts: BatchReceiptSummary[]) {
  _batch = receipts;
}

export function getBatchReceipts(): BatchReceiptSummary[] {
  return _batch;
}

export function clearBatchReceipts() {
  _batch = [];
}
