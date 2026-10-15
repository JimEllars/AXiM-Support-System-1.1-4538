
## AXiM Architecture Status
- **HMAC Signature Checks**: Ensure `verifyHmacSignature` uses `crypto.subtle` for timing-safe signature comparison to prevent timing side-channel attacks on webhook ingress routes.
- **Multi-Turn Reasoning**: When preserving LLM responses for diagnostic or user-facing streams, carefully manage the context window, appending valid reasoning content when available.
- **Client-Side Secret Exposure**: Never expose internal keys (e.g. `AXIM_INTERNAL_KEY`, `EMAILIT_API_KEY`) on the frontend `src/` UI bundle; proxy external actions through `onyx-edge-worker` edge boundary.
