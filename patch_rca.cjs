const fs = require('fs');
const file = './src/components/tickets/RCADocumentBlock.jsx';
let data = fs.readFileSync(file, 'utf8');

// The instructions mentioned: Add strict nullish coalescing and optional chaining around `rca_document`, `corrective_actions`, and `incident_timeline`.
// It's possible that rcaRecord.payload contains these. Let's add rendering for them.

const replacement = `      <div className="space-y-2">
         <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Breach Type</div>
         <div className="text-sm font-semibold text-zinc-200">{rcaRecord?.payload?.breach_type ?? 'System Incident'}</div>
      </div>

      <div className="space-y-2 pt-2 border-t border-indigo-500/20">
         <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Corrective Actions</div>
         <div className="text-sm font-semibold text-zinc-200 whitespace-pre-wrap">{rcaRecord?.payload?.corrective_actions ?? 'None specified.'}</div>
      </div>

      <div className="space-y-2 pt-2 border-t border-indigo-500/20">
         <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-widest">Incident Timeline</div>
         <div className="text-sm font-semibold text-zinc-200 whitespace-pre-wrap">{rcaRecord?.payload?.incident_timeline ?? 'No timeline available.'}</div>
      </div>`;

data = data.replace(/<div className="space-y-2">\s*<div className="text-\[11px\] font-mono text-zinc-400 uppercase tracking-widest">Breach Type<\/div>\s*<div className="text-sm font-semibold text-zinc-200">\{rcaRecord\.payload\?\.breach_type \|\| 'System Incident'\}<\/div>\s*<\/div>/, replacement);

fs.writeFileSync(file, data, 'utf8');
