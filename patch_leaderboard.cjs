const fs = require('fs');
const file = './src/components/analytics/OperatorLeaderboard.jsx';
let data = fs.readFileSync(file, 'utf8');

// Ensure that fetch url interpolation is correctly done
// Right now it's using \${apiUrl} from string literal without the \ as it was escaped when I dumped it, or maybe it was literally in the file.
// Let's check the fetch URL.

const fixedData = data.replace(/`\\\$\{apiUrl\}\/api\/v1\/analytics\/leaderboard`/g, '`${apiUrl}/api/v1/analytics/leaderboard`')
                      .replace(/`Bearer \\\$\{token\}`/g, '`Bearer ${token}`')
                      .replace(/\\\$\{idx === 0/g, '${idx === 0');

fs.writeFileSync(file, fixedData, 'utf8');
