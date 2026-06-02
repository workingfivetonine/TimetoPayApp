---
name: Using connector APIs from the code_execution sandbox
description: The sandbox can't import workspace-scoped @replit/connectors-sdk; use listConnections() to get credentials and call the vendor API directly.
---

The `code_execution` sandbox resolves `await import(...)` from the repo ROOT, so it
cannot import a package that's only installed under a workspace package
(e.g. `@replit/connectors-sdk`, a dependency of `artifacts/api-server`). You get
`ERR_MODULE_NOT_FOUND`.

**How to apply:** to drive a connector vendor API (SendGrid, etc.) from the sandbox, use
the pre-registered `listConnections("<connector>")` callback, read
`conns[0].settings` (e.g. `api_key`, `from_email`), and call the vendor REST API directly
with `fetch` + the credential. This is fine for one-off setup/verification (creating
SendGrid dynamic templates, sending a test mail/send). App code keeps using the SDK proxy.
