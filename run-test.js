import fs from 'fs';
const code = fs.readFileSync('onyx-edge-worker/src/index.ts', 'utf8');
const interfaceEnvIndex = code.indexOf('export interface Env {');
console.log(code.substring(interfaceEnvIndex, interfaceEnvIndex + 1000));
