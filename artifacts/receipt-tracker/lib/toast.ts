import Toast from "react-native-toast-message";

export const showSuccessToast = (title: string, message?: string) => {
  Toast.show({ type: "success", text1: title, text2: message, visibilityTime: 2000 });
};

export const showErrorToast = (title: string, message?: string) => {
  Toast.show({ type: "error", text1: title, text2: message, visibilityTime: 3000 });
};
