// Optional browser QA + 120-second silent video of actual synthetic simulation states.
// Prerequisites: npm install --no-save --package-lock=false playwright; npx playwright install chromium; ffmpeg.
// Run after npm run build. No credentials or Tide identities are used.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn, spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = process.env.DEMO_PORT || '3102';
const origin = `http://localhost:${port}`;
const frames = mkdtempSync(join(tmpdir(), 'altergether-video-'));
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', 'localhost', '-p', port], {
  env: { ...process.env, APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (d) => { serverOutput += d; }); server.stderr.on('data', (d) => { serverOutput += d; });
(async () => {
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin + '/demo')).ok) { ready = true; break; } } catch { /* starting */ }
      await delay(100);
    }
    if (!ready) throw new Error('Production server not ready');
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
      args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const errors = [], requests = [], dialogs = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/')) requests.push(new URL(r.url()).pathname); });
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
    const filenames = [];
    async function shot(title, subtitle, target) {
      if (target) await target.scrollIntoViewIfNeeded(); else await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(({ title, subtitle }) => {
        let caption = document.getElementById('recording-caption');
        if (!caption) { caption = document.createElement('div'); caption.id = 'recording-caption'; document.body.append(caption); }
        caption.setAttribute('style', 'position:fixed;inset:auto 0 0;z-index:1000;background:#163d30;color:white;padding:18px 44px;border-top:5px solid #f7d147;pointer-events:none;font:20px/1.4 Arial,sans-serif;box-shadow:0 -5px 30px #0002');
        const line = document.createElement('strong'); line.style.fontSize = '25px'; line.textContent = title;
        const detail = document.createElement('div'); detail.textContent = subtitle;
        const label = document.createElement('small'); label.style.cssText = 'display:block;color:#f7d147;font-size:14px;margin-top:5px';
        label.textContent = 'SIMULATION · SYNTHETIC DATA · Live Tide encryption and multi-admin governance are unverified';
        caption.replaceChildren(line, detail, label);
      }, { title, subtitle });
      await page.waitForTimeout(200);
      const file = join(frames, `${String(filenames.length).padStart(2,'0')}.png`);
      await page.screenshot({ path: file }); filenames.push(file);
    }
    await page.goto(origin + '/demo');
    await shot('ALTERGETHER: one sample, one named researcher', 'The idea: study language examples without giving the portal operator a master decryption key.');
    await page.getByRole('button', { name: 'Encrypt sample', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="demo-fingerprint"]').textContent.match(/[0-9A-F]{4} /));
    await shot('1 · Encrypt a Vietnamese sample in the browser', 'AES-GCM protects the original wording. Identity seals are local test doubles in this demonstration.', page.getByRole('button', { name: 'Encrypt sample', exact: true }));
    const fp = (await page.getByTestId('demo-fingerprint').innerText()).replaceAll(' ', '').slice(0, 16);
    await page.getByLabel('First 16 fingerprint characters').fill(fp);
    await page.getByRole('checkbox').check();
    await shot('2 · Confirm who receives the sample and why', 'In live use, the participant checks the fingerprint through a trusted channel and explicitly consents.', page.getByRole('button', { name: 'Share with Researcher A', exact: true }));
    await page.getByRole('button', { name: 'Share with Researcher A', exact: true }).click();
    await page.getByText('PASS · Owner made a key copy for Researcher A only.', { exact: true }).waitFor();
    await shot('3 · Only the owner creates the recipient key copy', 'ECDH, HKDF and AES-GCM bind that copy to this contribution, recipient, grant, purpose and version.', page.getByRole('heading', { name: '3. Read and challenge access' }));
    await page.getByRole('button', { name: 'Read as Researcher A', exact: true }).click();
    await page.getByTestId('decrypted-text').waitFor();
    assert.match(await page.getByTestId('decrypted-text').innerText(), /ngân hàng/);
    await shot('4 · Researcher A reads the approved original text', 'The browser unwraps A’s key copy and decrypts the sample. Vietnamese diacritics remain intact.', page.getByTestId('decrypted-text'));
    await page.getByRole('button', { name: 'Try as Researcher B', exact: true }).click();
    await page.getByText(/PASS · Researcher B could not unwrap/).waitFor();
    await shot('5 · Researcher B fails, even with A’s key copy', 'This attempt intentionally skips the simulated permission check and exercises real wrong-key rejection.', page.getByRole('button', { name: 'Try as Researcher B', exact: true }));
    await page.getByRole('button', { name: 'Try changed recipient', exact: true }).click();
    await page.getByText(/PASS · Editing recipient metadata/).waitFor();
    await shot('6 · Editing recipient metadata does not create a key', 'The cryptographic wrap still does not open for B. Real administrator quorum is not demonstrated.', page.getByRole('button', { name: 'Try changed recipient', exact: true }));
    await shot('7 · Consent includes a practical withdrawal limit', 'An authorised reader may keep earlier copies. A malicious operator can restore old records.', page.getByRole('heading', { name: '4. Participant · withdraw' }));
    await page.getByRole('button', { name: 'Withdraw Researcher A', exact: true }).click();
    await page.getByText(/PASS · New key and ciphertext created/).waitFor();
    await shot('8 · Re-encrypt and delete A’s current key copy', 'The current record moves to key version 2. The production API separately verifies saved-state denial.', page.getByRole('heading', { name: 'Observed results in this tab' }));
    await page.getByRole('button', { name: 'Test old key after withdrawal', exact: true }).click();
    await page.getByText(/PASS · A’s old key cannot decrypt/).waitFor();
    await shot('9 · A’s old key cannot open the current record', 'This is real cryptographic rejection. It cannot erase text or ciphertext copied during authorised access.', page.getByRole('heading', { name: 'Observed results in this tab' }));
    const events = await page.locator('.demo-events li').allTextContents();
    assert.equal(events.length, 7);
    assert.equal(requests.length, 0, 'Simulation must never call a protected API');
    await page.locator('details summary').click();
    await shot('10 · Inspect ciphertext and the actual observed results', 'The synthetic workflow is reviewable without Tide enrolment. It provides no real identity isolation.', page.locator('details'));
    await page.screenshot({ path: join(frames, 'browser-evidence.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(origin + '/demo');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile overflow');
    // Inert markup fixture: a real browser must display it as text, not execute it.
    await page.getByLabel('Synthetic language sample').selectOption('fx-en-1');
    await page.getByRole('button', { name: 'Encrypt sample', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="demo-fingerprint"]').textContent.match(/[0-9A-F]{4} /));
    const enFp = (await page.getByTestId('demo-fingerprint').innerText()).replaceAll(' ', '').slice(0, 16);
    await page.getByLabel('First 16 fingerprint characters').fill(enFp); await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Share with Researcher A', exact: true }).click();
    await page.getByRole('button', { name: 'Read as Researcher A', exact: true }).click();
    await page.getByTestId('decrypted-text').waitFor();
    assert.match(await page.getByTestId('decrypted-text').innerText(), /<img src=x onerror=/);
    assert.equal(dialogs.length, 0); assert.equal(errors.length, 0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/participant');
    await page.getByRole('heading', { name: 'Connect your TideCloak realm' }).waitFor();
    await shot('11 · Live Tide access stays locked until configured', 'The live path uses Tide SDK calls and verified JWT + DPoP. Full live enrolment remains a team verification step.');
    mkdirSync('demo', { recursive: true }); mkdirSync('evidence', { recursive: true });
    writeFileSync(join(frames, 'frames.txt'), filenames.map((file) => `file '${file}'\nduration 10`).join('\n') + `\nfile '${filenames.at(-1)}'\n`);
    const encode = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(frames, 'frames.txt'),
      '-vf', 'scale=1280:800,format=yuv420p,fps=15,tpad=stop_mode=clone:stop_duration=1', '-t', '120', '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', 'demo/altergether-demo.mp4'], { stdio: 'inherit' });
    assert.equal(encode.status, 0, 'Video encode');
    assert.ok(statSync('demo/altergether-demo.mp4').size < 100000000);
    writeFileSync('evidence/browser-checks.md', `# Browser checks — synthetic simulation\n\nObserved ${new Date().toISOString()} against the production build with Chromium.\n\n- Vietnamese contribution, fingerprint confirmation, explicit consent, A decryption, B wrong-key refusal, changed-recipient refusal, withdrawal and old-key refusal: PASS.\n- Seven observed workflow results; no protected API calls from /demo: PASS.\n- 390px viewport: no horizontal overflow.\n- Decrypted HTML attack fixture is inert text; no JavaScript dialogs or page errors: PASS.\n- Unconfigured live participant route displays setup guidance: PASS.\n- Two-minute H.264 MP4 generated from 12 actual browser states, ten seconds each; captions and timing are editorial. No live Tide session or real admin quorum is tested.\n`);
    console.log(JSON.stringify({ browserChecks: 'PASS', videoSeconds: 120, videoBytes: statSync('demo/altergether-demo.mp4').size, simulatedWorkflowEvents: events.length, browserErrors: errors.length }));
    if (process.env.DEMO_QA_IMAGE) require('node:fs').copyFileSync(join(frames, 'browser-evidence.png'), process.env.DEMO_QA_IMAGE);
  } finally { if (browser) await browser.close(); server.kill('SIGTERM'); rmSync(frames, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); console.error(serverOutput); process.exitCode = 1; });
