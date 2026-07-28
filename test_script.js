import * as fs from 'fs';
const indexTs = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf-8');
const onyxPanel = fs.readFileSync('src/components/tickets/OnyxInvestigationPanel.jsx', 'utf-8');
const actionBlock = fs.readFileSync('src/components/tickets/ActionProposalBlock.jsx', 'utf-8');

console.log("Checking index.ts for Deepseek modification:");
if (indexTs.includes('api.deepseek.com') && indexTs.includes('model: "deepseek-chat"')) {
    console.log("-> Deepseek fetch is present.");
} else {
    console.log("-> ERROR: Deepseek fetch missing.");
}
console.log("Checking OnyxInvestigationPanel.jsx:");
if (onyxPanel.includes('res.body.getReader();') && onyxPanel.includes('decoder = new TextDecoder("utf-8");')) {
    console.log("-> Native chunk decoding logic present.");
} else {
    console.log("-> ERROR: Native chunk decoding missing.");
}
console.log("Checking ActionProposalBlock.jsx:");
if (actionBlock.includes('const executionTrace = responseData.cf_ray') && actionBlock.includes('setLogDetails(prev => ({ ...prev, status: \'executed\' }));')) {
    console.log("-> State mutation logic present.");
} else {
    console.log("-> ERROR: State mutation logic missing.");
}
