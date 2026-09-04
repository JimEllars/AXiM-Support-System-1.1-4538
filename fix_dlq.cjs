const fs = require('fs');
let code = fs.readFileSync('src/components/tickets/DLQMonitorBlock.jsx', 'utf8');

const importStatement = `import { onyxService } from "../../services/onyxService";
import React, { useState, useEffect } from 'react';`;

// Let's add the replay handler inside DLQMonitorBlock
const handleEchoReplayCode = `
  const handleEchoReplay = async (itemId, jobId) => {
    setRetryingId(itemId);
    try {
      const echoUrl = import.meta.env.VITE_ECHO_RECOVERY_URL || 'http://localhost:54321/functions/v1/echo-recovery';
      const internalKey = import.meta.env.VITE_AXIM_INTERNAL_KEY || 'axim_internal_dev_key';

      const res = await fetch(\`\${echoUrl}/api/v1/recovery/replay-single\`, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
            'X-Axim-Signature': internalKey
         },
         body: JSON.stringify({ job_id: jobId })
      });

      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || 'Echo recovery replay failed');
      }

      toast.success("Payload successfully replayed via Echo Recovery!", {
        style: { background: '#09090b', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
      });
      fetchDLQData();
    } catch (err) {
      toast.error(\`Replay Failed: \${err.message}\`);
    } finally {
      setRetryingId(null);
    }
  };
`;

code = code.replace(
    'const handleRetryPayload = async (itemId, payload) => {',
    handleEchoReplayCode + '\n  const handleRetryPayload = async (itemId, payload) => {'
);


// Now, inside the map rendering dlqItems, let's add the Replay via Echo Recovery button next to "Inspect Payload"
// Wait, the prompt says "Add a 'Replay via Echo Recovery' button for tickets linked to DLQ failures."
// DLQMonitorBlock maps over `dlqItems`. Each item has `item.payload.metadata.job_id`? Or `item.payload.job_id`?
// In the instructions: `ticket.metadata.job_id`?
// Let's look at what's in item.payload. The instructions say `{ job_id: ticket.metadata.job_id }`. But wait, in the DLQ block it might be `item.payload.job_id` or `item.payload.metadata?.job_id`.
// Let's try `item.payload?.job_id || item.payload?.metadata?.job_id`.

const replayButton = `
              <div className="flex items-center gap-2 flex-shrink-0">
              {(item.payload?.job_id || item.payload?.metadata?.job_id) && (
                <button
                  onClick={() => handleEchoReplay(item.id, item.payload?.job_id || item.payload?.metadata?.job_id)}
                  disabled={retryingId === item.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[10px] text-emerald-400 border border-emerald-900/50 transition-all flex-shrink-0 disabled:opacity-50"
                >
                  <FiRefreshCw className={retryingId === item.id ? 'animate-spin' : ''} />
                  <span>{retryingId === item.id ? 'Replaying...' : 'Replay via Echo'}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedEvent(item);
                  setIsEditorModalOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[10px] text-indigo-300 border border-zinc-800 transition-all flex-shrink-0 disabled:opacity-50"
              >
                <FiSearch />
                <span>Inspect Payload</span>
              </button>
              </div>
`;

code = code.replace(
    /<button\s+onClick=\{\(\) => \{\s+setSelectedEvent\(item\);\s+setIsEditorModalOpen\(true\);\s+\}\}\s+className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-\[10px\] text-indigo-300 border border-zinc-800 transition-all flex-shrink-0 disabled:opacity-50"\s+>\s+<FiSearch \/>\s+<span>Inspect Payload<\/span>\s+<\/button>/g,
    replayButton
);

fs.writeFileSync('src/components/tickets/DLQMonitorBlock.jsx', code);
console.log('DLQMonitorBlock updated.');
