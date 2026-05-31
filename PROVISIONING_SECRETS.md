# Secure Secrets Provisioning Playbook

## Context
The Onyx Edge Worker relies exclusively on Cloudflare's secure secrets vault rather than local fallback configurations. This ensures zero infrastructure duplication and adherence to edge deployment standards.

## Execution Requirements
Administration and DevOps operators must execute the following `wrangler` commands directly from their authorized terminal within the `onyx-edge-worker` directory to securely bind the required API keys.

## Sequential Chain of Command Parameters

1. **Bind the Supabase Service Role Key:**
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   *(Paste the key when prompted)*

2. **Bind the Onyx Internal Communication Secret:**
   ```bash
   npx wrangler secret put AXIM_ONYX_SECRET
   ```
   *(Paste the key when prompted)*

3. **Bind the Anthropic API Key (Claude):**
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   *(Paste the key when prompted)*

4. **Bind the AXiM Core Proxy Service Key:**
   ```bash
   npx wrangler secret put AXIM_SERVICE_KEY
   ```
   *(Paste the key when prompted)*

## Verification
Once secrets are bound, you can review the currently configured bindings without revealing the actual string values by running:
```bash
npx wrangler secret list
```
