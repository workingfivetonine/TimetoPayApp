---
name: RN Web destructive confirmations
description: Why Alert.alert can't be used for confirmations on this Expo RN-Web app
---

# RN Web destructive confirmations

`Alert.alert` from react-native renders nothing on React Native Web — its
buttons silently no-op, so a destructive action wired to an Alert button never
fires (or fires with no confirmation) when the app runs in the browser/preview.

**Why:** This app (receipt-tracker) ships on web too, and the workspace preview
is web. Several delete flows shipped broken-on-web because they used
`Alert.alert`.

**How to apply:** For any confirm-before-destroy flow, use
`@/lib/confirm` `confirmDestructive({title, message, confirmLabel, onConfirm})`.
It uses `window.confirm` on web and `Alert.alert` natively. Don't reach for
`Alert.alert` directly for confirmations.
