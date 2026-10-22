"use client";
import { useCallback, useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { SessionGate } from "@/components/SessionGate";
import { EmptyShared } from "@/components/EmptyShared";
import { EvidenceLog } from "@/components/EvidenceLog";
import { useApi } from "@/lib/client/api";
import { binding, failure, type ReadResult } from "@/lib/client/workflow";
import type { Contribution, ResearcherKey } from "@/lib/server/store";
import { generateResearcherKeyPair, publicFromPkcs8, fingerprint, importPrivateKey, unwrapKey, decryptBody, sha256Hex, wipe } from "@/lib/crypto/envelope";
import { tideSeal, tideOpen } from "@/lib/tide/selfKeys";
import { STUDY, PURPOSE_LIMITATION } from "@/lib/fixtures";

export default function Researcher() {
  return <><TopBar /><PageHeader back={{ href: "/", label: "Home" }} title="Shared with you" lead="Only a participant can give you access to their sample." />
    <main><SessionGate role="researcher"><Workspace /></SessionGate></main></>;
}
function Workspace() {
  const api = useApi();
  const { doEncrypt, doDecrypt } = useTideCloak();
  const [keyRecord, setKeyRecord] = useState<ResearcherKey | null>(null);
  const [items, setItems] = useState<Pick<Contribution, "id" | "label" | "language">[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fp, setFp] = useState("");
  const [text, setText] = useState<{ id: string; value: string } | null>(null);
  const [probeId, setProbeId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(async () => {
    const [k, c] = await Promise.all([api<{ key: ResearcherKey | null }>("GET", "/api/researchers/me"),
      api<{ contributions: typeof items }>("GET", "/api/shared")]);
    setKeyRecord(k.key); setItems(c.contributions); setRefreshKey((n) => n + 1);
  }, [api]);
  useEffect(() => { refresh().catch((e) => setError(failure(e))); }, [refresh]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setText(null); setFp("");
    try { await fn(); } catch (e) { setError(failure(e)); }
    finally { try { await refresh(); } catch { setError("Could not refresh your access. Request again before assuming access is active."); } setBusy(false); }
  }
  async function read(id: string) {
    const data = await api<ReadResult>("GET", `/api/contributions/${encodeURIComponent(id)}`);
    const { key: record } = await api<{ key: ResearcherKey | null }>("GET", "/api/researchers/me");
    if (!record) throw new Error("Create your key first");
    const raw = await tideOpen(doDecrypt, record.encPrivateKey);
    try {
      const locallyDerived = await fingerprint(await publicFromPkcs8(raw));
      if (locallyDerived !== data.grant.recipientFingerprint || data.grant.purposeId !== STUDY.id ||
        data.grant.recipientSub !== record.sub || data.grant.contributionId !== id ||
        data.contribution.id !== id || data.grant.purposeHash !== await sha256Hex(STUDY.purpose)) throw new Error("Grant identity mismatch");
      const key = await unwrapKey(data.grant.wrap, await importPrivateKey(raw), binding(data.grant, data.contribution.keyVersion));
      try {
        const c = data.contribution;
        setText({ id, value: (await decryptBody(key, c.bodyCt, c.bodyIv, c.id, c.keyVersion)).text });
        setMessage("Decrypted in this browser. The server supplied only ciphertext and your key copy.");
      } finally { wipe(key); }
    } finally { wipe(raw); }
  }
  return <>
    {error && <p className="notice bad" role="alert">{error}</p>}<p className="status-line" role="status">{busy ? "Verifying…" : message}</p>
    <section className="panel"><h2>Your identity-bound key</h2>
      <p>Create a key once. Tide seals its private half to your identity; your browser opens it when you read.</p>
      {!keyRecord ? <button disabled={busy} onClick={() => run(async () => {
        const kp = await generateResearcherKeyPair();
        try { const encPrivateKey = await tideSeal(doEncrypt, kp.pkcs8);
          await api("POST", "/api/researchers/me", { publicJwk: kp.publicJwk, encPrivateKey }); setMessage("Your researcher key was created.");
        } finally { wipe(kp.pkcs8); }
      })}>Create my key</button> : <button disabled={busy} onClick={() => run(async () => {
        const { key } = await api<{ key: ResearcherKey }>("GET", "/api/researchers/me");
        const raw = await tideOpen(doDecrypt, key.encPrivateKey);
        try { const local = await fingerprint(await publicFromPkcs8(raw));
          const directory = await fingerprint(key.publicJwk);
          if (local !== directory) throw new Error("Directory key differs from identity key");
          setFp(local);
        } finally { wipe(raw); }
      })}>Show my fingerprint</button>}
      {fp && <div className="notice"><p className="mono">{fp}</p><p>Read the first 16 hexadecimal characters to the participant using a trusted channel.</p></div>}
    </section>
    <section className="panel"><div className="row between"><h2>Active shares</h2><button className="secondary" disabled={busy} onClick={() => run(refresh)}>Refresh access</button></div>
      <p><strong>{STUDY.title}</strong></p><p className="small">{PURPOSE_LIMITATION}</p>
      {!items.length ? <EmptyShared /> : <div className="stack">{items.map((c) => <article className="card" key={c.id}><h3>{c.label}</h3><p className="mono">{c.id}</p>
        <button disabled={busy || !keyRecord} onClick={() => run(() => read(c.id))}>Read / request again</button>
        {text?.id === c.id && <p className="text-sample">{text.value}</p>}
      </article>)}</div>}
    </section>
    <section className="panel"><h2>Test a contribution ID</h2><p>A changed ID never gives you access to someone else&apos;s sample.</p>
      <label htmlFor="probe-id">Contribution ID</label><input id="probe-id" type="text" value={probeId} onChange={(e) => setProbeId(e.target.value)} />
      <button style={{ marginTop: 16 }} disabled={busy || !probeId} onClick={() => run(() => read(probeId))}>Request this sample</button>
      {text?.id === probeId && <p className="text-sample">{text.value}</p>}
    </section>
    <EvidenceLog refreshKey={refreshKey} />
  </>;
}
