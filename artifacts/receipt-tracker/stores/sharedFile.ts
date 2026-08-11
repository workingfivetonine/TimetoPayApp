// Receipts handed to the app from another app's share sheet (Photos, Files, …),
// parked here for the scan screen to pick up on mount. Same module-state pattern
// as `pendingReceipt` — the share intent arrives outside the navigation flow, so
// it can't be passed as a route param. A share sheet can hand over several files
// at once (selecting a run of receipt photos in Photos), so this holds a list.
export interface SharedReceiptFile {
  uri: string;
  kind: "image" | "pdf";
  width: number | null;
  height: number | null;
}

let _sharedFiles: SharedReceiptFile[] = [];

export function setSharedFiles(files: SharedReceiptFile[]) {
  _sharedFiles = files;
}

// Reads and clears in one step: a share is consumed exactly once, so a remount
// can't reprocess the same files.
export function takeSharedFiles(): SharedReceiptFile[] {
  const files = _sharedFiles;
  _sharedFiles = [];
  return files;
}

export function clearSharedFiles() {
  _sharedFiles = [];
}
