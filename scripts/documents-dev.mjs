import { spawn } from 'node:child_process';
process.loadEnvFile('.work/documents.env');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','3020'], { stdio:'inherit',windowsHide:true });
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',code=>process.exit(code ?? 1));
