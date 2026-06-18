const fs = require('fs');
let code = fs.readFileSync('src/components/tickets/ActionProposalBlock.jsx', 'utf8');

const replacement = `
        <div className="text-zinc-400 text-sm font-mono bg-black/40 p-2 rounded overflow-x-auto relative">
          {log.tool_type === 'apply_git_patch' && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(log.payload.patch || JSON.stringify(log.payload));
                toast.success("Patch copied to clipboard", {
                    style: { background: '#18181b', color: '#10b981', border: '1px solid #047857' }
                });
              }}
              className="absolute top-2 right-2 text-zinc-500 hover:text-cyan-400 transition-colors p-1 bg-black/50 rounded"
              title="Copy Patch"
            >
              <SafeIcon icon={FiIcons.FiCopy} />
            </button>
          )}
          <pre>{JSON.stringify(log.payload, null, 2)}</pre>
        </div>`;

code = code.replace(/<div className="text-zinc-400 text-sm font-mono bg-black\/40 p-2 rounded overflow-x-auto">\s*\{JSON\.stringify\(log\.payload, null, 2\)\}\s*<\/div>/, replacement);
fs.writeFileSync('src/components/tickets/ActionProposalBlock.jsx', code);
