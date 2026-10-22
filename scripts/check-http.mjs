// Run production HTTP smoke/negative checks without requiring local secrets or Tide enrolment.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const port = process.env.TEST_PORT || '3101';
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', port], {
  env: { ...process.env, APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (d) => { output += d; });
server.stderr.on('data', (d) => { output += d; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Server exited before readiness');
    try { if ((await fetch(origin + '/api/status')).ok) { ready = true; break; } } catch { /* starting */ }
    await delay(100);
  }
  if (!ready) throw new Error('Server did not become ready');
  for (const path of ['/', '/demo', '/participant', '/researcher', '/checks']) {
    const r = await fetch(origin + path);
    if (r.status !== 200) throw new Error(`${path} returned ${r.status}`);
  }
  console.log('PASS: homepage, simulation, participant, researcher and security-check pages return HTTP 200.');
  const tests = spawn(process.execPath, ['scripts/test-api.mjs'], { env: { ...process.env, APP_ORIGIN: origin }, stdio: 'inherit' });
  const code = await new Promise((resolve) => tests.on('exit', resolve));
  if (code !== 0) throw new Error('HTTP negative checks failed');
} catch (e) { console.error(e.message); console.error(output); process.exitCode = 1; }
finally { server.kill('SIGTERM'); }
