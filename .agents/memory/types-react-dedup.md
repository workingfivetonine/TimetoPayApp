---
name: Single @types/react across the workspace
description: Why @types/react / @types/react-dom are pinned via a pnpm override, and what breaks if they aren't.
---

# Single @types/react across the workspace

`@types/react` and `@types/react-dom` are pinned to one version workspace-wide via a
`pnpm.overrides` entry (`"@types/react": "catalog:"`) in `pnpm-workspace.yaml`.

**Why:** Web artifacts (mockup-sandbox/Canvas) want `^19.2` while the Expo app
(receipt-tracker) pins `~19.1`. That left two `@types/react` versions in the pnpm
store. Web packages that don't declare an `@types/react` peer (e.g. `lucide-react`,
`react-day-picker`) resolve react's types via the *hoisted* copy
(`.pnpm/node_modules/@types/react`, which was 19.1.17), clashing with the artifact's
own 19.2 types. Symptom: `tsc` errors like "Two different types named
VoidOrUndefinedOnly exist" / incompatible `ref` props — a green-looking app that fails
`pnpm run typecheck`.

**How to apply:** Keep both types on a single version. If you must change the React
types version, change the catalog pin (`catalog: '@types/react'`) — the override keeps
every package, including Expo, in lockstep. If you ever see the "two different
VoidOrUndefinedOnly" error again, check for a second `@types/react` in
`node_modules/.pnpm` and whether the hoisted version differs from the artifact's.
