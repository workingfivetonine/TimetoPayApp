---
name: Replit secrets and shared env vars are one store
description: Gotcha — in this repl, a "shared" env var and a "secret" with the same key are the same underlying entry; deleting one removes both.
---

In this Replit environment, `viewEnvVars` reports a single shared env var TWICE: once
under `envVars.shared` (with its value) and once under `secrets` as `true`. They are
the **same underlying entry**, not two independent stores.

**Consequence:** calling `deleteEnvVars({ keys, environment: "shared" })` on such a key
also flips its `secrets` flag to `false` — i.e. it deletes the "secret" too. There is no
separate secret to keep.

**Why it bit us:** after `setEnvVars` (shared) for the SendGrid template IDs, the user
also "provided secrets" for the same keys. Assuming these were duplicate stores, deleting
the shared env vars to "keep the secrets" wiped the values entirely. Had to re-`setEnvVars`
to restore them.

**How to apply:** Do NOT try to dedupe "env var vs secret" for the same key — they are one
thing. Non-sensitive config (emails, template ids, plan ids) can be written directly with
`setEnvVars`; truly sensitive values still go through `requestEnvVar`. `requestEnvVar`-provided
values and `setEnvVars` values land in the same place.
