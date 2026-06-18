const fs = require('fs');
let code = fs.readFileSync('src/components/analytics/SupportMetrics.jsx', 'utf8');

const replacement = `  if (error) {
    return (
      <div className="glass-panel p-6 rounded-2xl flex items-center justify-center border-rose-500/30">
        <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">
          ⚠️ Telemetry offline. Retrying...
        </p>
      </div>
    );
  }

  return (`;

code = code.replace('  return (', replacement);
fs.writeFileSync('src/components/analytics/SupportMetrics.jsx', code);
