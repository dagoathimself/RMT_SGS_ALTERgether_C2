"use client";
import { useState } from "react";
import { Logo } from "@/components/Brand";
import { FIXTURES, WITHDRAWAL_LIMITATION } from "@/lib/fixtures";
import { createSimulation, type Simulation } from "@/lib/demo/simulation";

export default function Demo() {
  const [demo, setDemo] = useState<Simulation | null>(null);
  const [view, setView] = useState<ReturnType<Simulation["view"]> | null>(null);
  const [fixture, setFixture] = useState("fx-vi-1");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState("");
  async function run(fn: () => Promise<string>) {
    setBusy(true); setError(""); setText("");
    try { const event = await fn(); setEvents((previous) => [...previous, event]); }
    catch { setError("The operation was refused. Check the state and fingerprint, then retry."); }
    finally { setView(demo?.view() ?? null); setBusy(false); }
  }
  return <>
    <header className="top"><a href="/" aria-label="Home"><Logo height={36} /></a><nav><span className="badge warn">SIMULATION · SYNTHETIC DATA</span><a href="/">Live portal</a></nav></header>
    <div className="band"><div className="wrap"><p className="eyebrow">A consent decision you can see</p><h1>One sample. One researcher. Your choice.</h1>
      <p className="lead">Explore browser encryption, named sharing, an unapproved reader and withdrawal.</p>
      <p className="notice"><strong>Tide identity and portal decisions are simulated.</strong> WebCrypto encryption and wrong-key rejection are real. All simulated identities share this tab. This is not a live Tide or multi-admin security test.</p>
    </div></div>
    <main className="demo-workspace">
      {error && <p role="alert" className="notice bad">{error}</p>}
      <section className="panel"><div className="row between"><h2>1. Participant · contribute</h2>{view && <span className="badge info">{view.state} · key v{view.keyVersion}</span>}</div>
        <label htmlFor="fixture">Synthetic language sample</label><select id="fixture" value={fixture} disabled={!!demo || busy} onChange={(e) => setFixture(e.target.value)}>{FIXTURES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
        <p className="text-sample">{FIXTURES.find((f) => f.id === fixture)?.text}</p>
        <div className="row"><button disabled={busy || !!demo} onClick={async () => {
          setBusy(true); setError("");
          try { const next = await createSimulation(fixture); setDemo(next); setView(next.view()); setEvents(["PASS · Synthetic sample encrypted in this browser. No recipient key copy exists."]); }
          catch { setError("Browser cryptography is unavailable. Use localhost or HTTPS."); }
          finally { setBusy(false); }
        }}>Encrypt sample</button><button className="secondary" disabled={busy} onClick={() => { setDemo(null); setView(null); setText(""); setEvents([]); setTyped(""); setConsent(false); }}>Reset this demo</button></div>
      </section>
      <section className="panel"><h2>2. Participant · consent</h2><div className="grid">
        <div className="card"><h3>Researcher A · approved recipient</h3><p>Purpose: read one synthetic language sample for a qualitative study. No model training or bulk export.</p>
          <p>In the live portal, ask the researcher to read their fingerprint through a trusted channel.</p>
          <p className="mono" data-testid="demo-fingerprint">{view?.fingerprint ?? "Encrypt a sample to generate the demo researcher key."}</p>
        </div>
        <div className="card"><h3>Confirm this recipient</h3><label htmlFor="demo-fp">First 16 fingerprint characters</label><input id="demo-fp" type="text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <label className="row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to share this sample with Researcher A for this purpose.</label>
          <button disabled={busy || view?.state !== "private" || !consent} onClick={() => run(async () => { await demo!.share(typed); return "PASS · Owner made a key copy for Researcher A only."; })}>Share with Researcher A</button>
        </div>
      </div></section>
      <section className="panel"><h2>3. Read and challenge access</h2><div className="grid">
        <div className="card"><h3>Researcher A</h3><p>Open the owner-approved key copy, then decrypt the text locally.</p><button disabled={busy || !demo} onClick={() => run(async () => {
          setText(await demo!.readA()); return "PASS · Researcher A decrypted the original wording in this browser.";
        })}>Read as Researcher A</button></div>
        <div className="card"><h3>Researcher B · unapproved</h3><p>Even with A&apos;s ciphertext and key copy, B&apos;s private key must fail.</p><button disabled={busy || view?.state !== "active"} onClick={() => run(async () => {
          if (!await demo!.refuseB()) throw new Error("Unexpected decryption"); return "PASS · Researcher B could not unwrap A’s key copy, even with the complete ciphertext.";
        })}>Try as Researcher B</button></div>
        <div className="card"><h3>Administrator tampering</h3><p>Change the recipient metadata in the simulated grant. The existing wrap must not open for B.</p><button disabled={busy || view?.state !== "active"} onClick={() => run(async () => {
          if (!await demo!.refuseB(true)) throw new Error("Unexpected decryption"); return "PASS · Editing recipient metadata did not create a usable key copy for B. Governance remains simulated.";
        })}>Try changed recipient</button></div>
      </div>{text && <div className="notice"><strong>Decrypted locally · original wording preserved</strong><p className="text-sample" data-testid="decrypted-text">{text}</p></div>}</section>
      <section className="panel"><h2>4. Participant · withdraw</h2><p>{WITHDRAWAL_LIMITATION}</p><p>A malicious operator could restore old ciphertext and an old wrap. Re-keying protects the current record, while withdrawal through the portal still depends on its server.</p>
        <div className="row"><button className="danger" disabled={busy || view?.state !== "active"} onClick={() => run(async () => {
          await demo!.withdraw(); return "PASS · New key and ciphertext created. Researcher A’s current key copy was deleted (simulated portal state).";
        })}>Withdraw Researcher A</button>
          <button disabled={busy || view?.state !== "withdrawn"} onClick={() => run(async () => {
            if (!await demo!.refuseWithdrawnKey()) throw new Error("Unexpected decryption"); return "PASS · A’s old key cannot decrypt the current re-keyed record. Previously copied text remains outside withdrawal.";
          })}>Test old key after withdrawal</button></div>
      </section>
      <section className="panel"><h2>Observed results in this tab</h2><ol className="demo-events" aria-live="polite">{events.map((e, i) => <li key={i}>{e}</li>)}</ol>
        {view && <details><summary>Inspect the simulated stored record</summary><p>Only ciphertext, sealed key blobs and metadata are shown. The identity seals here are local AES test doubles.</p><pre className="mono">{JSON.stringify({ ...view, fingerprint: undefined, bodyCt: `${view.bodyCt.slice(0, 90)}…`, ownerKeyCt: `${view.ownerKeyCt.slice(0, 70)}…`, sealedResearcherKey: `${view.sealedResearcherKey.slice(0, 70)}…` }, null, 2)}</pre></details>}
      </section>
    </main>
  </>;
}
