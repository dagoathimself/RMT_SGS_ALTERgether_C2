"use client";
import { useCallback, useEffect, useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { SessionGate } from "@/components/SessionGate";
import { SampleCards } from "@/components/SampleCards";
import { StateBadge } from "@/components/Status";
import { EvidenceLog } from "@/components/EvidenceLog";
import { useApi } from "@/lib/client/api";
import { binding, checkRecipient, failure, type OwnerContribution, type DirectoryEntry, type GrantSummary } from "@/lib/client/workflow";
import { FIXTURES, STUDY, WITHDRAWAL_LIMITATION, PURPOSE_LIMITATION } from "@/lib/fixtures";
import { newContributionKey, encryptBody, decryptBody, sha256Hex, wrapKey, wipe, type KeyWrap } from "@/lib/crypto/envelope";
import { tideSeal, tideOpen } from "@/lib/tide/selfKeys";

export default function Participant() {
  return <><TopBar /><PageHeader back={{ href: "/", label: "Home" }} title="Your contributions" lead="Choose a synthetic sample, then decide who may read it." />
    <main><SessionGate role="participant"><Workspace /></SessionGate></main></>;
}

function Workspace() {
  const api = useApi();
  const { doEncrypt, doDecrypt } = useTideCloak();
  const [items, setItems] = useState<OwnerContribution[]>([]);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState(FIXTURES[2]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [shareId, setShareId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [typed, setTyped] = useState("");
  const [consent, setConsent] = useState(false);
  const [withdrawId, setWithdrawId] = useState("");
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const refresh = useCallback(async () => {
    const [c, d] = await Promise.all([api<{ contributions: OwnerContribution[] }>("GET", "/api/contributions"),
      api<{ researchers: DirectoryEntry[] }>("GET", "/api/researchers")]);
    setItems(c.contributions); setDirectory(d.researchers); setRefreshKey((k) => k + 1);
  }, [api]);
  useEffect(() => { refresh().catch((e) => setError(failure(e))); }, [refresh]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try { await fn(); }
    catch (e) { setError(failure(e)); }
    finally { try { await refresh(); } catch { setError("The saved state could not be refreshed. Retry before assuming success."); } setBusy(false); }
  }
  async function contribute() {
    const id = `c_${crypto.randomUUID().replace(/-/g, "")}`;
    const key = newContributionKey();
    try {
      const encrypted = await encryptBody(key, { text: selected.text, language: selected.language, synthetic: true,
        fixtureId: selected.id, sha256: await sha256Hex(selected.text) }, id, 1);
      const ownerKeyCt = await tideSeal(doEncrypt, key);
      await api("POST", "/api/contributions", { id, fixtureId: selected.id, ...encrypted, ownerKeyCt });
      setMessage("Encrypted in your browser and contributed. Nothing is shared yet.");
    } finally { wipe(key); }
  }
  async function share(c: OwnerContribution) {
    if (!consent) throw new Error("Consent is required");
    const { contribution: fresh } = await api<{ contribution: OwnerContribution }>("GET", `/api/contributions/${c.id}`);
    const { researchers } = await api<{ researchers: DirectoryEntry[] }>("GET", "/api/researchers");
    const target = researchers.find((r) => r.sub === recipient);
    if (!target) throw new Error("Choose a researcher");
    await checkRecipient(target.publicJwk, typed);
    const key = await tideOpen(doDecrypt, fresh.ownerKeyCt);
    let pendingId = "";
    try {
      const { grant } = await api<{ grant: GrantSummary }>("POST", "/api/grants", {
        contributionId: c.id, recipientSub: recipient, purposeId: STUDY.id,
        confirmedFingerprint: typed, expectedKeyVersion: fresh.keyVersion,
      });
      pendingId = grant.id;
      if (grant.contributionId !== c.id || grant.recipientSub !== target.sub ||
        grant.purposeId !== STUDY.id || grant.purposeHash !== await sha256Hex(STUDY.purpose)) {
        throw new Error("Returned grant differs from consent");
      }
      const wrap = await wrapKey(key, target.publicJwk, binding(grant, fresh.keyVersion));
      await api("POST", `/api/grants/${grant.id}/activate`, { wrap, expectedKeyVersion: fresh.keyVersion });
      setShareId(""); setTyped(""); setConsent(false); setMessage(`Shared with ${target.name} for the displayed study.`);
    } catch (e) {
      if (pendingId) { try { await api("POST", `/api/grants/${pendingId}/cancel`, {}); } catch { /* pending entry remains visible and cancellable */ } }
      throw e;
    } finally { wipe(key); }
  }
  async function withdraw(g: GrantSummary) {
    const result = await api<{ contribution: OwnerContribution; alreadyRekeyed: boolean }>("POST", `/api/grants/${g.id}/withdraw`, {});
    const c = result.contribution;
    if (!result.alreadyRekeyed) {
      const { researchers } = await api<{ researchers: DirectoryEntry[] }>("GET", "/api/researchers");
      const active = c.grants.filter((x) => x.state === "active");
      const recipients = await Promise.all(active.map(async (x) => {
        const r = researchers.find((r) => r.sub === x.recipientSub);
        if (!r || await checkRecipient(r.publicJwk, confirmations[x.id] || "") !== x.recipientFingerprint ||
          x.contributionId !== c.id || x.purposeId !== STUDY.id || x.purposeHash !== await sha256Hex(STUDY.purpose)) throw new Error("Grant confirmation mismatch");
        return { grant: x, researcher: r };
      }));
      const oldKey = await tideOpen(doDecrypt, c.ownerKeyCt);
      const newKey = newContributionKey();
      try {
        const payload = await decryptBody(oldKey, c.bodyCt, c.bodyIv, c.id, c.keyVersion);
        const encrypted = await encryptBody(newKey, payload, c.id, c.keyVersion + 1);
        const ownerKeyCt = await tideSeal(doEncrypt, newKey);
        const remainingWraps: { grantId: string; wrap: KeyWrap; confirmedFingerprint: string }[] = [];
        for (const { grant, researcher } of recipients) remainingWraps.push({ grantId: grant.id,
          wrap: await wrapKey(newKey, researcher.publicJwk, binding(grant, c.keyVersion + 1)), confirmedFingerprint: confirmations[grant.id] });
        await api("POST", `/api/grants/${g.id}/complete-withdrawal`, { expectedKeyVersion: c.keyVersion,
          ...encrypted, ownerKeyCt, remainingWraps });
      } finally { wipe(oldKey); wipe(newKey); }
    }
    const verification = await api<{ verified: boolean }>("POST", `/api/grants/${g.id}/verify-withdrawal`, {});
    if (!verification.verified) throw new Error("Withdrawal unverified");
    setWithdrawId(""); setConfirmations({}); setMessage("Withdrawn: re-keyed, key copy removed, and a fresh saved-state access check refused.");
  }

  return <>
    <p className="notice">Synthetic samples only. No real scam reports or personal information are accepted in this prototype.</p>
    {error && <p className="notice bad" role="alert">{error}</p>}
    <p className="status-line" role="status">{busy ? "Verifying and saving…" : message}</p>
    <section className="panel" id="pick"><h2>Choose a sample</h2><h3>{selected.label}</h3>
      <p className="text-sample">{selected.text}</p>
      <button disabled={busy || items.some((c) => c.fixtureId === selected.id)} onClick={() => run(contribute)}>Encrypt and contribute</button>
      <div style={{ marginTop: 24 }}><SampleCards selectedId={selected.id} contributed={new Set(items.map((c) => c.fixtureId))} onPreview={setSelected} /></div>
    </section>
    <section className="panel"><div className="row between"><h2>Your encrypted samples</h2><button className="secondary" disabled={busy} onClick={() => run(async () => { await refresh(); })}>Refresh</button></div>
      {!items.length && <p>Choose a sample above to make your first contribution.</p>}
      <div className="stack">{items.map((c) => <article className="card" key={c.id}>
        <div className="row between"><h3>{c.label}</h3><span className="chip">Key version {c.keyVersion}</span></div>
        <p className="mono">{c.id}</p><p>Encrypted · synthetic · {c.grants.filter((g) => g.state === "active").length} active recipient(s)</p>
        <div className="row">
          <button className="secondary" disabled={busy} onClick={() => run(async () => {
            const { contribution: fresh } = await api<{ contribution: OwnerContribution }>("GET", `/api/contributions/${c.id}`);
            const key = await tideOpen(doDecrypt, fresh.ownerKeyCt);
            try { setPreview({ id: c.id, text: (await decryptBody(key, fresh.bodyCt, fresh.bodyIv, fresh.id, fresh.keyVersion)).text }); }
            finally { wipe(key); }
          })}>Read my sample</button>
          <button disabled={busy || c.grants.some((g) => g.state === "withdrawal_pending")} onClick={() => { setShareId(c.id); setTyped(""); setConsent(false); }}>Share</button>
        </div>
        {preview?.id === c.id && <p className="text-sample">{preview.text}</p>}
        {shareId === c.id && <section className="panel">
          <h3>Consent for one named researcher</h3><p><strong>{STUDY.title}</strong></p><p>{STUDY.purpose}</p><p className="small">{PURPOSE_LIMITATION}</p>
          <label htmlFor="recipient">Researcher</label><select id="recipient" value={recipient} onChange={(e) => { setRecipient(e.target.value); setTyped(""); setConsent(false); }}>
            <option value="">Choose a researcher</option>{directory.map((r) => <option key={r.sub} value={r.sub}>{r.name}</option>)}
          </select>
          {!directory.length && <p className="notice">Ask a researcher to sign in and create their key first.</p>}
          <label htmlFor="fingerprint">First 16 fingerprint characters, read to you by the researcher</label>
          <input id="fingerprint" type="text" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          <label className="row"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to share this sample with the selected researcher for this purpose.</label>
          <div className="row"><button disabled={busy || !consent || !recipient || typed.replace(/\s/g, "").length !== 16} onClick={() => run(() => share(c))}>Give access</button>
            <button className="secondary" disabled={busy} onClick={() => setShareId("")}>Close</button></div>
        </section>}
        {c.grants.length > 0 && <div className="table-wrap"><table><thead><tr><th>Researcher</th><th>State</th><th>Action</th></tr></thead>
          <tbody>{c.grants.map((g) => <tr key={g.id}><td>{g.recipientName}</td><td><StateBadge state={g.state} /></td><td>
            {g.state === "pending" && <button className="secondary" disabled={busy} onClick={() => run(async () => { await api("POST", `/api/grants/${g.id}/cancel`, {}); })}>Cancel pending grant</button>}
            {["active", "withdrawal_pending"].includes(g.state) && <button className="danger" disabled={busy} onClick={() => { setWithdrawId(g.id); setConfirmations({}); }}>{g.state === "active" ? "Withdraw" : "Resume withdrawal"}</button>}
          </td></tr>)}</tbody></table></div>}
        {c.grants.filter((g) => g.id === withdrawId).map((g) => <section className="panel" key={g.id}><h3>Withdraw access from {g.recipientName}</h3>
          <p>{WITHDRAWAL_LIMITATION}</p><p>New portal reads are blocked as soon as withdrawal begins. Re-keying and verification complete the withdrawal.</p>
          {c.grants.filter((x) => x.state === "active" && x.id !== g.id).map((x) => <div key={x.id}><label htmlFor={`fp-${x.id}`}>Confirm {x.recipientName}&apos;s fingerprint to preserve their access</label>
            <input id={`fp-${x.id}`} type="text" autoComplete="off" value={confirmations[x.id] || ""} onChange={(e) => setConfirmations({ ...confirmations, [x.id]: e.target.value })} /></div>)}
          <div className="row" style={{ marginTop: 16 }}><button className="danger" disabled={busy} onClick={() => run(() => withdraw(g))}>Confirm withdrawal</button>
            <button className="secondary" disabled={busy} onClick={() => setWithdrawId("")}>Close</button></div>
        </section>)}
      </article>)}</div>
    </section>
    <EvidenceLog refreshKey={refreshKey} />
  </>;
}
