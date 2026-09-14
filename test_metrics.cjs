const fs = require('fs');
const metricsFile = './src/components/analytics/SupportMetrics.jsx';
let data = fs.readFileSync(metricsFile, 'utf8');
console.log(data.match(/const response = await fetch\(import\.meta\.env\.VITE_CORE_API_URL.*?\);/));
