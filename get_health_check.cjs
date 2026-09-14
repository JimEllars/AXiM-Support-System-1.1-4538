const fs = require('fs');
const file = './onyx-edge-worker/src/index.ts';
let data = fs.readFileSync(file, 'utf8');
const handleHealthCheckCode = data.match(/async function handleHealthCheck[\s\S]*?function logInfo/);
console.log(handleHealthCheckCode ? handleHealthCheckCode[0].substring(0, handleHealthCheckCode[0].length - 17) : "Not found");
