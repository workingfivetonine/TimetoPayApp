import OpenAI from "openai";

// Plain OpenAI SDK client talking straight to api.openai.com. This used to point
// at a Replit-provisioned AI proxy via AI_INTEGRATIONS_OPENAI_BASE_URL; the app
// no longer depends on Replit for anything, so it reads a normal OpenAI key.
//
// Required env var (set in Railway):
//   OPENAI_API_KEY — from platform.openai.com -> API keys
//
// OPENAI_BASE_URL is optional and only needed to point at a compatible proxy.
// Fails fast at import: AI receipt parsing is core, so a missing key should stop
// the boot rather than surface as a per-request 500.
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY must be set.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
});
