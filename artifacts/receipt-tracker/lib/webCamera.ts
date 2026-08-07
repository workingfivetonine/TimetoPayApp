// Native stub. The real implementation is webCamera.web.ts.
//
// On native, camera capture goes through expo-image-picker's launchCameraAsync,
// so nothing here is ever reached. This file exists so the import resolves on
// iOS and Android and Metro doesn't pull DOM code into the native bundle.

export interface WebCapturedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

/** Web only. Always false on native. */
export function canUseWebCamera(): boolean {
  return false;
}

export async function captureWithWebCamera(): Promise<WebCapturedImage | null> {
  return null;
}
