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
