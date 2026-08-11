import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { fetch as expoFetch } from "expo/fetch";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import {
  getGetShoppingListQueryKey,
  getListItemsQueryKey,
  getListReceiptsQueryKey,
  getListStoresQueryKey,
  getGetSpendAnalyticsQueryKey,
  getGetDailySpendQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import ImageEditor from "@/components/ImageEditor";
import { setPendingReceipt, type ParsedReceiptData } from "@/stores/pendingReceipt";
import { setBatchReceipts, type BatchReceiptSummary } from "@/stores/batchReceipts";
import { ScanProgress, type ScanProgressValue } from "@/components/ScanProgress";
import { takeSharedFiles } from "@/stores/sharedFile";
import { getApiOrigin } from "@/lib/apiBase";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { canUseWebCamera, captureWithWebCamera } from "@/lib/webCamera";

interface PendingImage {
  uri: string;
  width: number;
  height: number;
}

// A photo as it comes back from a picker, before we've read any bytes.
interface PickedAsset {
  uri: string;
  width?: number;
  height?: number;
}

// Minimal shape we need from a saved-receipt response (parse-and-save / each
// parse-pdf page) to build a batch-review summary.
interface SavedReceipt {
  id: number;
  isDuplicate?: false;
  storeName?: string | null;
  total?: number | null;
  purchasedAt?: string | null;
  lineItems?: unknown[];
  // Only parse-pdf returns this — a small thumbnail of the source page.
  previewUri?: string | null;
}

// How many PDFs one upload may carry. Each is its own request that can fan out
// to a model call per page, so this bounds a select-all to something the per-user
// AI quota can actually absorb.
const MAX_PDFS_PER_UPLOAD = 10;

// A PDF page that matched an already-saved receipt; not persisted to the DB.
interface DuplicateReceipt {
  isDuplicate: true;
  potentialDuplicateOf: number | null;
  storeName: string;
  total: number;
  purchasedAt: string;
}

// Native and web read files differently: native uses expo-file-system (the
// blob/FileReader path only works in a browser), which is why PDF upload used to
// fail on the phone.
async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const fileResponse = await expoFetch(uri);
    const blob = await fileResponse.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const b64 = dataUrl.split(",")[1];
        if (!b64) reject(new Error("Empty file"));
        else resolve(b64);
      };
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) throw new Error("Empty file");
  return base64;
}

// Re-encode a picked photo to JPEG and hand back its base64.
//
// Two reasons this can't be skipped by asking the picker for base64 directly.
// The server wraps whatever we send in a `data:image/jpeg;base64,` URL, and on
// iOS expo-image-picker takes a fast path that copies the ORIGINAL file — HEIC
// on any modern iPhone — so photos sent straight through were being handed to
// the model mislabelled as JPEG. And the picker's own base64 is read natively
// with `try?`: a full-resolution photo that fails to load under memory pressure
// comes back with base64 silently nil, which used to abort the whole scan with
// no error at all. Reading it here means a failure is an exception we can report.
//
// The long edge is capped the same way the crop editor caps it, so photos that
// bypass the editor (multi-select) can't blow the upload size limit either.
async function toJpegBase64(uri: string, width?: number, height?: number): Promise<string> {
  const actions: Parameters<typeof manipulateAsync>[1] = [];
  if (width && height && Math.max(width, height) > 2400) {
    actions.push(width >= height ? { resize: { width: 2400 } } : { resize: { height: 2400 } });
  }
  const result = await manipulateAsync(uri, actions, {
    format: SaveFormat.JPEG,
    compress: 0.9,
    base64: true,
  });
  if (!result.base64) throw new Error("Empty image");
  return result.base64;
}

function toSummary(saved: SavedReceipt): BatchReceiptSummary {
  return {
    id: saved.id,
    storeName: saved.storeName ?? "Unknown Store",
    total: saved.total ?? 0,
    itemCount: saved.lineItems?.length ?? 0,
    purchasedAt: saved.purchasedAt ?? new Date().toISOString(),
    previewUri: saved.previewUri ?? null,
  };
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanningLabel, setScanningLabel] = useState("");
  // Counted work, for a real progress bar. Null when there is nothing genuine to
  // count (a single file is one opaque server call), in which case the overlay
  // shows a moving bar and no number rather than a made-up percentage.
  const [scanProgress, setScanProgress] = useState<ScanProgressValue | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);

  // "Save & Next" on the review screen routes here with ?autoOpen=1 so the next
  // receipt can be captured without an extra tap. Fires once per arrival; the
  // ref guard stops a re-render (or the picker returning) from reopening it.
  const { autoOpen, shared } = useLocalSearchParams<{ autoOpen?: string; shared?: string }>();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpen !== "1" || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    void handleAddPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  // A receipt shared in from another app (see useReceiptShareIntent). Routed here
  // with ?shared=1; the file itself is parked in module state because the intent
  // arrives outside navigation. `takeSharedFiles` clears as it reads, so a remount
  // can't reprocess it.
  const sharedHandledRef = useRef(false);
  useEffect(() => {
    if (shared !== "1" || sharedHandledRef.current) return;
    sharedHandledRef.current = true;
    const files = takeSharedFiles();
    if (files.length === 0) return;
    void (async () => {
      const pdfs = files.filter((f) => f.kind === "pdf");
      const images = files.filter((f) => f.kind === "image");

      // A mixed share has no single sensible pipeline, and silently scanning
      // half of it is worse than saying so. PDFs win because they are the more
      // expensive thing to re-share.
      if (pdfs.length > 0 && images.length > 0) {
        Alert.alert(
          "Mixed files shared",
          `We'll scan the ${pdfs.length} PDF${pdfs.length === 1 ? "" : "s"} you shared. Share the ${images.length} photo${images.length === 1 ? "" : "s"} separately.`,
        );
      }

      if (pdfs.length > 0) {
        const capped = pdfs.slice(0, MAX_PDFS_PER_UPLOAD);
        let encoded: string[];
        try {
          encoded = await Promise.all(capped.map((f) => readFileAsBase64(f.uri)));
        } catch {
          showErrorToast(
            "Couldn't open those files",
            "We couldn't read the shared PDFs. Try opening TimetoPay and adding them directly.",
          );
          return;
        }
        if (encoded.length === 1) await parsePdf(encoded[0]!);
        else await parseMultiplePdfs(encoded);
        return;
      }

      const assets: PickedAsset[] = images.map((f) => ({
        uri: f.uri,
        width: f.width ?? undefined,
        height: f.height ?? undefined,
      }));

      if (assets.length === 1) {
        // Same crop-then-scan path as a picked photo — the editor reads and
        // re-encodes the file itself, so nothing is read here. Dimensions can be
        // absent from a share intent; the editor needs numbers, so fall back to a
        // square and let it re-measure.
        setPendingImage({
          uri: assets[0]!.uri,
          width: assets[0]!.width ?? 1000,
          height: assets[0]!.height ?? 1000,
        });
        return;
      }

      // Several photos shared at once are ambiguous in exactly the way a
      // multi-select from the library is, so ask the same question.
      Alert.alert(
        "Multiple photos shared",
        "Are these photos of the same receipt, or different receipts?",
        [
          { text: "Same receipt", onPress: () => void parseCombinedReceipt(assets) },
          { text: "Different receipts", onPress: () => void parseMultipleImages(assets) },
          { text: "Cancel", style: "cancel" },
        ],
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
    // A scan can create a new store — refresh the Stores list so it appears.
    queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
  };

  // Carries the HTTP status (and any server message) so we can show the user a
  // specific reason for an upload failure + the right recommendation.
  class UploadError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? `API error ${status}`);
      this.status = status;
    }
  }

  // Turn an upload failure into a plain-language reason + recommendation. Always
  // ends by pointing the user at the manual entry fallback.
  const failureReason = (err: unknown, kind: "image" | "pdf"): string => {
    if (err instanceof UploadError) {
      switch (err.status) {
        case 413:
          return kind === "pdf"
            ? "This PDF is too large to process. Try a smaller file (fewer pages), or add the details manually."
            : "This image is too large to process. Try a smaller or lower-resolution photo, or add the details manually.";
        case 429:
          return "You've reached the limit for AI scans right now. Please wait a few minutes and try again, or add the details manually.";
        case 422:
          return kind === "pdf"
            ? "We couldn't read this PDF — it may be a scanned image, password-protected, or corrupted. Try a text-based order confirmation, or add the details manually."
            : "We couldn't read this photo clearly. Try a sharper, well-lit picture with the whole receipt in frame, or add the details manually.";
        case 400:
          return "That file didn't look like a receipt we could read. Try a different file, or add the details manually.";
        default:
          if (err.status >= 500)
            return "Our scanner had a temporary problem. Please try again in a moment, or add the details manually.";
          return "Something went wrong reading this receipt. Please try again, or add the details manually.";
      }
    }
    // No HTTP status — almost always a network/connectivity problem.
    return "We couldn't reach the scanner. Check your internet connection and try again, or add the details manually.";
  };

  // Show the failure reason as a toast — visible in all environments including
  // cross-origin iframes where window.alert() is blocked.
  const showUploadFailure = (
    err: unknown,
    kind: "image" | "pdf",
    _retry: () => void,
  ) => {
    showErrorToast("Couldn't read this receipt", failureReason(err, kind));
  };

  const callApi = async <T,>(path: string, body: object): Promise<T> => {
    const url = `${getApiOrigin()}/api/receipts/${path}`;
    const token = await getToken();
    const response = await expoFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-platform": Platform.OS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new UploadError(response.status);
    return response.json() as Promise<T>;
  };

  // Capture a receipt with the device camera. Same asset shape as the library
  // picker, so it feeds the identical crop-and-review flow. Camera capture is
  // inherently one shot at a time — no multi-select branch to handle.
  const handleTakePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Camera access needed",
        "To take a photo of a receipt, allow camera access for TimetoPay in your device settings.",
      );
      return;
    }
    // No `base64: true` — the crop editor re-encodes from the uri anyway, and
    // asking the picker for it only adds a full-resolution read that can fail
    // silently. See toJpegBase64.
    const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingImage({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
    });
  };

  // Camera capture on the web build. Phone browsers can open the camera from a
  // file input carrying the `capture` attribute; desktop cannot, which is why
  // canUseWebCamera() gates the option rather than always showing it.
  const handleWebTakePhoto = async () => {
    try {
      const shot = await captureWithWebCamera();
      if (!shot) return; // dismissed
      setPendingImage(shot);
    } catch {
      showErrorToast("Couldn't open the camera", "Try choosing a photo instead.");
    }
  };

  // Entry point for the primary scan button. Native offers camera or library.
  // Web offers the same pair on a phone, and goes straight to the file picker on
  // desktop, where "Take Photo" would just open a file dialog.
  const handleAddPhoto = async () => {
    if (Platform.OS === "web") {
      if (!canUseWebCamera()) {
        await handlePickImage();
        return;
      }
      Alert.alert("Add a receipt", "Take a photo now, or pick one you already have?", [
        { text: "Take Photo", onPress: () => void handleWebTakePhoto() },
        { text: "Choose Photo", onPress: () => void handlePickImage() },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    Alert.alert("Add a receipt", "Take a photo now, or pick one you already have?", [
      { text: "Take Photo", onPress: () => void handleTakePhoto() },
      { text: "Choose from Library", onPress: () => void handlePickImage() },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handlePickImage = async () => {
    // Deliberately no `base64: true`. Every path below reads the bytes itself
    // (crop editor, or toJpegBase64) — asking the picker for base64 as well made
    // it read every selected photo at full resolution up front, and a photo it
    // failed to read came back with base64 quietly missing, which was then
    // filtered out and left the scan doing nothing at all.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1.0,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const assets: PickedAsset[] = result.assets;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Single photo → the existing crop-and-review flow. Multiple photos →
    // prompt the user: same receipt (combine into one AI call) or different
    // receipts (process each separately).
    if (assets.length === 1) {
      const asset = assets[0];
      setPendingImage({
        uri: asset.uri,
        width: asset.width ?? 1000,
        height: asset.height ?? 1000,
      });
    } else {
      Alert.alert(
        "Multiple photos selected",
        "Are these photos of the same receipt, or different receipts?",
        [
          {
            text: "Same receipt",
            onPress: () => void parseCombinedReceipt(assets),
          },
          {
            text: "Different receipts",
            onPress: () => void parseMultipleImages(assets),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
    }
  };

  // Send all photos as one combined AI call — used when multiple images are
  // different angles/sections of the same physical receipt.
  const parseCombinedReceipt = async (assets: PickedAsset[]) => {
    setScanning(true);
    setScanningLabel("Combining photos and analyzing receipt…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Read the photos before the upload try/catch: a file we can't open is a
    // different problem from a scan that failed, and deserves its own message.
    let imagesBase64: string[];
    try {
      imagesBase64 = await Promise.all(
        assets.map((a) => toJpegBase64(a.uri, a.width, a.height)),
      );
    } catch {
      setScanning(false);
      showErrorToast(
        "Couldn't open those photos",
        "One of the selected photos couldn't be read. Try picking them again, or add the details manually.",
      );
      return;
    }

    try {
      const result = await callApi<SavedReceipt>("parse-and-save-batch", { imagesBase64 });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      showSuccessToast("Receipt scanned", "Combined photos processed");
      router.replace(`/receipt/${result.id}`);
    } catch (err) {
      showUploadFailure(err, "image", () => parseCombinedReceipt(assets));
    } finally {
      setScanning(false);
    }
  };

  // Parse several photos at once, saving each as its own receipt. Failures on
  // individual photos are collected and reported without aborting the rest.
  const parseMultipleImages = async (assets: PickedAsset[]) => {
    setScanning(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const summaries: BatchReceiptSummary[] = [];
    let failures = 0;
    // These run CONCURRENTLY, so progress has to count what has finished. The
    // old label was set from the loop index before each request started, which
    // meant all of them fired at once and it read "photo 5 of 5" while nothing
    // had actually come back yet.
    let done = 0;
    setScanningLabel("Analyzing your photos…");
    setScanProgress({ done: 0, total: assets.length });
    try {
      await Promise.all(
        assets.map(async (asset) => {
          try {
            // Reading the photo is inside the per-photo try on purpose: one
            // unreadable file counts as that photo failing, not the whole batch.
            const base64 = await toJpegBase64(asset.uri, asset.width, asset.height);
            const result = await callApi<SavedReceipt>("parse-and-save", { imageBase64: base64 });
            summaries.push(toSummary(result));
          } catch {
            failures++;
          } finally {
            // Counted in `finally` so a failed photo still advances the bar —
            // otherwise the bar stalls short of the end and looks stuck.
            done++;
            setScanProgress({ done, total: assets.length });
          }
        })
      );
    } finally {
      setScanning(false);
      setScanProgress(null);
    }

    if (summaries.length === 0) {
      showErrorToast(
        "Couldn't process photos",
        "None of the selected photos could be analyzed. Make sure they're clear, readable receipts and try again.",
      );
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateAll();

    if (failures > 0) {
      showErrorToast(
        "Some photos couldn't be processed",
        `Saved ${summaries.length} of ${assets.length} photos. The others may be unreadable — try adding them again or add the details manually.`,
      );
    } else {
      showSuccessToast("Receipt scanned", `${summaries.length} photo${summaries.length === 1 ? "" : "s"} processed`);
    }

    if (summaries.length === 1) {
      router.replace(`/receipt/${summaries[0].id}`);
    } else {
      setBatchReceipts(summaries);
      router.replace("/batch-review");
    }
  };

  const handleEditorConfirm = async (editedBase64: string) => {
    setPendingImage(null);
    await parseImage(editedBase64);
  };

  const parseImage = async (editedBase64: string) => {
    setScanning(true);
    setScanningLabel("Analyzing receipt with AI…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = `${getApiOrigin()}/api/receipts/parse`;
      const token = await getToken();
      const response = await expoFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-platform": Platform.OS,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: editedBase64 }),
      });
      if (!response.ok) throw new UploadError(response.status);
      const parsed = (await response.json()) as ParsedReceiptData;
      setPendingReceipt(parsed, editedBase64);
      router.push("/review-receipt");
    } catch (err) {
      showUploadFailure(err, "image", () => parseImage(editedBase64));
    } finally {
      setScanning(false);
    }
  };

  const handleEditorCancel = () => setPendingImage(null);

  const handlePickPdf = async () => {
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: true,
      });
    } catch {
      showErrorToast("Error", "Could not open the file picker.");
      return;
    }

    if (result.canceled || !result.assets?.length) return;

    const picked = result.assets.filter((a) => a.uri);
    if (picked.length === 0) return;

    // Each PDF is a separate server round-trip that can itself fan out to
    // PDF_MAX_PAGES model calls, so the count is capped here rather than letting
    // a stray select-all turn into hundreds of calls.
    const files = picked.slice(0, MAX_PDFS_PER_UPLOAD);
    const dropped = picked.length - files.length;
    if (dropped > 0) {
      Alert.alert(
        "Too many PDFs",
        `You can upload ${MAX_PDFS_PER_UPLOAD} PDFs at a time, so we'll scan the first ${MAX_PDFS_PER_UPLOAD} and skip ${dropped}. Upload the rest in a second batch.`,
      );
    }

    // Read the picked files into base64 first, then hand off, so a failed parse
    // can be retried without re-picking.
    let encoded: string[];
    try {
      encoded = await Promise.all(files.map((a) => readFileAsBase64(a.uri)));
    } catch {
      showErrorToast(
        "Couldn't open those files",
        "One of the selected PDFs couldn't be read. Try choosing them again, or add the details manually.",
      );
      return;
    }

    if (encoded.length === 1) {
      await parsePdf(encoded[0]!);
    } else {
      await parseMultiplePdfs(encoded);
    }
  };

  // Scan several PDFs in one go. They are sent SEQUENTIALLY, not in parallel:
  // each one already fans out to a model call per page, and the server's
  // per-user concurrency cap would reject the overflow as a rate-limit error
  // that reads to the user like a failed scan.
  const parseMultiplePdfs = async (files: string[]) => {
    setScanning(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const summaries: BatchReceiptSummary[] = [];
    let failed = 0;
    let duplicates = 0;
    let skippedPages = 0;

    setScanningLabel("Analyzing your PDFs…");
    setScanProgress({ done: 0, total: files.length });
    try {
      for (const [index, base64] of files.entries()) {
        try {
          const { receipts, pagesSkipped = 0 } = await callApi<{
            receipts: (SavedReceipt | DuplicateReceipt)[];
            pagesSkipped?: number;
          }>("parse-pdf", { pdfBase64: base64 });

          const saved = receipts.filter((r): r is SavedReceipt => !r.isDuplicate);
          duplicates += receipts.length - saved.length;
          skippedPages += pagesSkipped;
          summaries.push(...saved.map(toSummary));
        } catch {
          failed++;
        } finally {
          // A failed PDF still advances the bar, so it can't stall short of the
          // end and look stuck.
          setScanProgress({ done: index + 1, total: files.length });
        }
      }
    } finally {
      setScanning(false);
      setScanProgress(null);
    }

    if (summaries.length === 0) {
      showErrorToast(
        duplicates > 0 ? "Already uploaded" : "Couldn't read those PDFs",
        duplicates > 0
          ? "Every page in these PDFs matches a receipt you've already scanned."
          : "None of the selected PDFs could be read. They may be blank, low quality, or not receipts.",
      );
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    invalidateAll();

    const notes = [
      duplicates > 0 ? `${duplicates} duplicate page${duplicates === 1 ? "" : "s"} skipped` : "",
      failed > 0 ? `${failed} PDF${failed === 1 ? "" : "s"} couldn't be read` : "",
      skippedPages > 0 ? `${skippedPages} page${skippedPages === 1 ? "" : "s"} over the page limit` : "",
    ].filter(Boolean);

    showSuccessToast(
      "PDFs scanned",
      `${summaries.length} receipt${summaries.length === 1 ? "" : "s"} extracted${notes.length ? ` — ${notes.join(", ")}` : ""}`,
    );

    setBatchReceipts(summaries);
    router.replace("/batch-review");
  };

  const parsePdf = async (base64: string) => {
    setScanning(true);
    setScanningLabel("Analyzing receipt with AI…");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { receipts, pagesSkipped = 0 } = await callApi<{
        receipts: (SavedReceipt | DuplicateReceipt)[];
        pagesSkipped?: number;
      }>("parse-pdf", { pdfBase64: base64 });

      const saved = receipts.filter((r): r is SavedReceipt => !r.isDuplicate);
      const dupCount = receipts.length - saved.length;

      // Pages beyond the server's per-PDF cap are never processed. Surface that
      // explicitly (an Alert, not a toast — the user has to split the file to
      // get the rest in, so it shouldn't be missable).
      const warnSkippedPages = () => {
        if (pagesSkipped <= 0) return;
        Alert.alert(
          "Some pages weren't scanned",
          `This PDF is longer than the per-scan page limit, so ${pagesSkipped} page${pagesSkipped === 1 ? "" : "s"} ${pagesSkipped === 1 ? "was" : "were"} skipped. Split the file and upload the rest as a separate PDF.`,
        );
      };

      if (saved.length === 0) {
        // Every page matched an existing receipt — nothing new was saved.
        showErrorToast(
          "Already uploaded",
          dupCount === 1
            ? "This receipt looks like one you've already scanned."
            : "These receipts look like ones you've already scanned.",
        );
        warnSkippedPages();
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();

      if (dupCount > 0) {
        showSuccessToast(
          "PDF scanned",
          `${saved.length} of ${receipts.length} page${receipts.length === 1 ? "" : "s"} saved — ${dupCount} duplicate${dupCount === 1 ? "" : "s"} skipped`,
        );
      } else {
        showSuccessToast(
          "PDF scanned",
          `${saved.length} receipt${saved.length === 1 ? "" : "s"} extracted`,
        );
      }

      warnSkippedPages();

      // Always land on batch-review, even for a single page. It is the only
      // screen that shows the rendered page next to what the AI read, which is
      // exactly when a misread is cheap to fix.
      setBatchReceipts(saved.map(toSummary));
      router.replace("/batch-review");
    } catch (err) {
      showUploadFailure(err, "pdf", () => parsePdf(base64));
    } finally {
      setScanning(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.secondary }]}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Add Receipt</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accent }]}>
          <Feather name="upload" size={36} color={colors.primary} />
        </View>

        <Text style={[styles.headline, { color: colors.foreground }]}>Upload a receipt</Text>
        <Text style={[styles.subtext, { color: colors.mutedForeground }]}>
          AI extracts the store, items, and prices automatically
        </Text>

        {/* Upload buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleAddPhoto}
            disabled={scanning}
            activeOpacity={0.8}
          >
            {/* Only say "Choose Photo" where the camera genuinely isn't on offer,
                i.e. desktop web. A phone browser can capture, so it gets the same
                camera framing as native. */}
            <Feather
              name={Platform.OS === "web" && !canUseWebCamera() ? "image" : "camera"}
              size={20}
              color="#fff"
            />
            <Text style={styles.primaryBtnText}>
              {Platform.OS === "web" && !canUseWebCamera() ? "Choose Photo" : "Scan Receipt"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handlePickPdf}
            disabled={scanning}
            activeOpacity={0.8}
          >
            <Feather name="file-text" size={20} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              Upload PDF
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          PDFs work best for online order confirmations — pick up to{" "}
          {MAX_PDFS_PER_UPLOAD} at once
        </Text>

        <View style={[styles.tipsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tipsTitle, { color: colors.foreground }]}>
            Tips for the best scan
          </Text>
          {[
            "Lay the receipt flat and fill the frame, corner to corner.",
            "Use bright, even light — avoid shadows and glare.",
            "Long receipt? Take a few photos and choose “Same receipt”.",
            "For online orders, upload the emailed PDF for the cleanest read.",
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <Feather name="check" size={13} color={colors.primary} style={{ marginTop: 2 }} />
              <Text style={[styles.tipText, { color: colors.mutedForeground }]}>{tip}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.manualRow}>
          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => router.push("/manual-entry")}
            disabled={scanning}
            activeOpacity={0.7}
          >
            <Feather name="edit-3" size={15} color={colors.mutedForeground} />
            <Text style={[styles.manualBtnText, { color: colors.mutedForeground }]}>
              Enter Manually
            </Text>
          </TouchableOpacity>

          <View style={[styles.manualDot, { backgroundColor: colors.border }]} />

          <TouchableOpacity
            style={styles.manualBtn}
            onPress={() => router.push("/quick-add")}
            disabled={scanning}
            activeOpacity={0.7}
          >
            <Feather name="list" size={15} color={colors.mutedForeground} />
            <Text style={[styles.manualBtnText, { color: colors.mutedForeground }]}>
              Log Items
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Scanning overlay */}
      {scanning && (
        <View style={styles.overlay}>
          <View style={[styles.overlayCard, { backgroundColor: colors.card }]}>
            <ScanProgress label={scanningLabel} progress={scanProgress} />
          </View>
        </View>
      )}

      {/* Image editor — shown after picking a photo, before sending to AI */}
      {pendingImage && (
        <ImageEditor
          uri={pendingImage.uri}
          imageWidth={pendingImage.width}
          imageHeight={pendingImage.height}
          onConfirm={handleEditorConfirm}
          onCancel={handleEditorCancel}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  headline: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  buttons: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  hint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    width: "100%",
    marginTop: 12,
    marginBottom: 4,
  },
  tipsCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    gap: 8,
  },
  tipsTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  manualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  manualBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  manualDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 14,
    minWidth: 200,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  overlayText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
});
