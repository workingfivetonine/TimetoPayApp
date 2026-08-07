// Camera capture for the web build, on phones.
//
// The scan screen used to skip the camera entirely on web ("no in-app camera
// worth offering") and go straight to the file picker. That is true on desktop
// but wrong on a phone browser: a file input carrying the `capture` attribute
// opens the camera directly on both iOS Safari and Android Chrome.
//
// Note the plain library picker isn't a substitute. expo-image-picker asks for
// multiple selection, which renders <input multiple>, and a multi-select input
// is exactly the case where mobile browsers tend to drop the "Take Photo"
// option from the chooser. So capture needs its own single-file input.

export interface WebCapturedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

/**
 * True only where a camera is plausible and the UI is touch-driven. Desktop
 * browsers ignore `capture` and would just show a file dialog, which is a
 * confusing thing to label "Take Photo".
 */
export function canUseWebCamera(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touch = (navigator.maxTouchPoints ?? 0) > 0;
  return coarse && touch;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the captured photo."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // readAsDataURL yields "data:image/jpeg;base64,AAAA..." but the rest of the
      // pipeline expects the bare base64 that expo-image-picker returns natively.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function measure(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    // Dimensions are only used for the review screen's aspect ratio, so failing
    // to measure should not fail the capture.
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = objectUrl;
  });
}

/**
 * Opens the camera and resolves with the photo, or null if the user backs out.
 *
 * Cancellation on a file input is not directly observable: no event fires when
 * the picker is dismissed. The window regaining focus is the usual proxy, so
 * that is used to resolve null rather than leaving the promise hanging forever.
 */
export async function captureWithWebCamera(): Promise<WebCapturedImage | null> {
  if (!canUseWebCamera()) return null;

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // "environment" asks for the rear camera, which is the one pointed at a
    // receipt. Desktop browsers ignore this attribute entirely.
    input.setAttribute("capture", "environment");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);

    let settled = false;
    const cleanup = () => {
      window.removeEventListener("focus", onFocus);
      input.remove();
    };

    const onFocus = () => {
      // Give the change event a chance to land first; focus returns before the
      // file is delivered.
      setTimeout(() => {
        if (settled) return;
        if (!input.files || input.files.length === 0) {
          settled = true;
          cleanup();
          resolve(null);
        }
      }, 800);
    };

    input.onchange = async () => {
      if (settled) return;
      settled = true;
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      try {
        const [base64, dims] = await Promise.all([readAsBase64(file), measure(objectUrl)]);
        cleanup();
        resolve({ uri: objectUrl, base64, width: dims.width, height: dims.height });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        cleanup();
        reject(err);
      }
    };

    window.addEventListener("focus", onFocus);
    input.click();
  });
}
