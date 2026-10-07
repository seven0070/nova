import {mkdir,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
export async function fakeDocker(folder){const bin=path.join(folder,'bin');await mkdir(bin,{recursive:true});const file=path.join(bin,'docker');await writeFile(file,`#!/usr/bin/env node
const a=process.argv.slice(2);if(a[0]==='rm')process.exit(0);if(!a.includes('--read-only')||!a.includes('no-new-privileges=true')||!a.includes('none'))process.exit(99);const command=a.at(-1);if(command==='sleep 5')setTimeout(()=>process.exit(0),5000);else if(command==='exit 7')process.exit(7);else process.stdout.write(command.replace(/^printf /,''));
`);await chmod(file,0o700);return bin;}
