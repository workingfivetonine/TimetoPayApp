import React from "react";
import { vexo } from 'vexo-analytics';

// Initialize Vexo at the root level, outside of any component
// Recommended to wrap in production-only check
if (__DEV__ === false) {
  vexo('dd657ff7-a5c5-4071-8f47-14c99c0d9951');
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
