const fs = require('fs');
let code = fs.readFileSync('src/components/analytics/OperatorLeaderboard.jsx', 'utf8');

// The endpoint will return something like op.average_csat or op.score.
// The instructions say: "Aggregate average CSAT score per operator and render star ratings next to rep names."

// Let's modify the UI to include CSAT stars next to op.email.
code = code.replace(
    '<span className="text-xs font-medium text-zinc-200 truncate">{op.email.split(\'@\')[0]}</span>',
    \`<span className="text-xs font-medium text-zinc-200 truncate">{op.email.split('@')[0]}</span>
                  {op.avg_csat > 0 && (
                     <div className="flex items-center gap-0.5 ml-2" title={\\\`Average CSAT: \${op.avg_csat.toFixed(1)}\\\`}>
                       {[...Array(5)].map((_, i) => (
                         <FiStar key={i} className={\\\`w-2 h-2 \${i < Math.round(op.avg_csat) ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'}\\\`} />
                       ))}
                     </div>
                  )}\`
);

fs.writeFileSync('src/components/analytics/OperatorLeaderboard.jsx', code);
console.log('Leaderboard updated.');
