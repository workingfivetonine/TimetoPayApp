---
name: Single @types/react across the workspace
description: Why @types/react / @types/react-dom are pinned via a pnpm override, and what breaks if they aren't.
---

# Single @types/react across the workspace

`@types/react` and `@types/react-dom` are pinned to one version workspace-wide via a
`pnpm.overrides` entry (`"@types/react": "catalog:"`) in `pnpm-workspace.yaml`.

**Why:** Two issues, one knob.
1. Two `@types/react` versions in the store let web packages that don't declare an
   `@types/react` peer (e.g. `lucide-react`, `react-day-picker`) resolve react's types
   via the *hoisted* copy, clashing with an artifact's own types. Symptom: `tsc` errors
   like "Two different types named VoidOrUndefinedOnly exist" / incompatible `ref` props.
2. The *version* matters: the catalog must be pinned to **`~19.1.x`**, NOT `^19.2`.
   Expo SDK 54 / react-native 0.81 require `@types/react ~19.1` (the receipt-tracker
   `package.json` already declares `~19.1.10`). On `19.2.x`, react-native-svg and
   expo-blur fail with TS2786/TS2607 "X cannot be used as a JSX component … missing
   props/state from Component" across the Expo app. Web artifacts are fine on `19.1`.

Both symptoms are green-looking apps (runtime is unaffected) that fail
`pnpm run typecheck`.

**How to apply:** Keep both types on ONE version, pinned to `~19.1.x` via the catalog
(`@types/react`, `@types/react-dom` in `pnpm-workspace.yaml`); the `pnpm.overrides`
(`"@types/react": "catalog:"`) forces every package, including Expo, into lockstep.
Do NOT bump the catalog to `19.2+` to satisfy a web package — verify the Expo app
still typechecks first. After changing the catalog, `pnpm install` mid-session can
leave stale `_tmp_*` dirs that crash Metro's file watcher (ENOENT on
`@radix-ui/react-select_tmp_*/dist`); restart the Expo workflow to clear it.
