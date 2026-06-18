const fs = require('fs');
let code = fs.readFileSync('src/components/analytics/SupportMetrics.jsx', 'utf8');

code = code.replace(`    if (error) {
    return (
      <div className="glass-panel p-6 rounded-2xl flex items-center justify-center border-rose-500/30">
        <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">
          ⚠️ Telemetry offline. Retrying...
        </p>
      </div>
    );
  }`, '');

code = code.replace(`  // SVG Progress Ring logic`, `  if (error) {
    return (
      <div className="glass-panel p-6 rounded-2xl flex items-center justify-center border-rose-500/30">
        <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">
          ⚠️ Telemetry offline. Retrying...
        </p>
      </div>
    );
  }

  // SVG Progress Ring logic`);

fs.writeFileSync('src/components/analytics/SupportMetrics.jsx', code);
