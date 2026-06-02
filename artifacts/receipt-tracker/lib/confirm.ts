import { Alert, Platform } from "react-native";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function confirmDestructive({ title, message, confirmLabel, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === "web") {
    const webConfirm = (globalThis as unknown as { confirm?: (msg: string) => boolean }).confirm;
    const ok = webConfirm ? webConfirm(`${title}\n\n${message}`) : false;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * Non-destructive confirmation (web `window.confirm`, native default-styled
 * button). Use for positive actions like starting a free trial.
 */
export function confirmAction({ title, message, confirmLabel, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === "web") {
    const webConfirm = (globalThis as unknown as { confirm?: (msg: string) => boolean }).confirm;
    const ok = webConfirm ? webConfirm(`${title}\n\n${message}`) : true;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "default", onPress: onConfirm },
  ]);
}

/**
 * Simple web-friendly notice (RN's Alert.alert renders nothing useful on web).
 * Used to tell the user an action can't proceed while offline.
 */
export function notify(title: string, message: string): void {
  if (Platform.OS === "web") {
    const webAlert = (globalThis as unknown as { alert?: (msg: string) => void }).alert;
    if (webAlert) webAlert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

