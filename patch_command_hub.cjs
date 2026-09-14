const fs = require('fs');
const file = './src/components/OnyxCommandHub.jsx';
let data = fs.readFileSync(file, 'utf8');

data = data.replace(
  /import \{ FiTerminal, FiCornerDownLeft, FiX \} from 'react-icons\/fi';/,
  `import SafeIcon from '../common/SafeIcon';`
);

data = data.replace(/<FiTerminal /g, '<SafeIcon icon={null} name="Terminal" ');
data = data.replace(/<FiCornerDownLeft /g, '<SafeIcon icon={null} name="CornerDownLeft" ');
data = data.replace(/<FiX /g, '<SafeIcon icon={null} name="X" ');

// Update styles for the command hub
data = data.replace(/className="absolute bottom-full left-0 mb-2 w-80 bg-zinc-950\/90 backdrop-blur-xl border border-zinc-800\/80 rounded-2xl shadow-2xl overflow-hidden z-50"/g,
  'className="absolute bottom-full left-0 mb-2 w-96 bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-50 transition-all duration-300 transform"');

fs.writeFileSync(file, data, 'utf8');
