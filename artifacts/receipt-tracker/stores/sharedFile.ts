// A receipt handed to the app from another app's share sheet (Photos, Files, …),
// parked here for the scan screen to pick up on mount. Same single-slot
// module-state pattern as `pendingReceipt` — the share intent arrives outside the
// navigation flow, so it can't be passed as a route param.
export interface SharedReceiptFile {
  uri: string;
  kind: "image" | "pdf";
  width: number | null;
  height: number | null;
}

let _sharedFile: SharedReceiptFile | null = null;

export function setSharedFile(file: SharedReceiptFile) {
  _sharedFile = file;
}

// Reads and clears in one step: a share is consumed exactly once, so a remount
// can't reprocess the same file.
export function takeSharedFile(): SharedReceiptFile | null {
  const file = _sharedFile;
  _sharedFile = null;
  return file;
}

export function clearSharedFile() {
  _sharedFile = null;
}
