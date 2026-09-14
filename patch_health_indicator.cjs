const fs = require('fs');
const file = './src/components/layout/CoreHealthIndicator.jsx';
let data = fs.readFileSync(file, 'utf8');

// The instructions say: Update status pills with clean Tailwind transitions, subtle pulsating indicators for live worker ping states, and crisp dark-mode typography. Standardize icon usage using src/common/SafeIcon.jsx to eliminate broken icon tags.

data = data.replace(
  /import \{ FiActivity, FiClock, FiShield \} from 'react-icons\/fi';/,
  `import SafeIcon from '../../common/SafeIcon';`
);

data = data.replace(/<FiActivity /g, '<SafeIcon icon={null} name="Activity" ');
data = data.replace(/<FiClock /g, '<SafeIcon icon={null} name="Clock" ');
data = data.replace(/<FiShield /g, '<SafeIcon icon={null} name="Shield" ');

// Update styling to include transitions, pulsating indicators
data = data.replace(/className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300"/g,
  'className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800/80 text-zinc-300 shadow-sm transition-all hover:bg-zinc-800 hover:border-zinc-700 hover:text-white"');

data = data.replace(/text-emerald-400'/g, 'text-emerald-400 animate-pulse\'');
data = data.replace(/text-sky-400'/g, 'text-sky-400 animate-pulse\'');
data = data.replace(/text-indigo-400'/g, 'text-indigo-400 animate-pulse\'');
data = data.replace(/text-purple-400'/g, 'text-purple-400 animate-pulse\'');

fs.writeFileSync(file, data, 'utf8');
