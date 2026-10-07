#!/usr/bin/env node
'use strict';
const clean = value => String(value).replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
try { require('../.worker/worker/nova.js').main().catch(error => { console.error(clean(error.message)); process.exitCode = 1; }); }
catch(error) { if(error.code === 'MODULE_NOT_FOUND') console.error('Build Nova first: npm install && npm run worker:build'); else console.error(clean(error.message)); process.exitCode = 1; }
