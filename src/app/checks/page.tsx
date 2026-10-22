"use client";
import { useState } from "react";
import { useTideCloak } from "@tidecloak/nextjs";
import { TopBar } from "@/components/TopBar";
import { PageHeader } from "@/components/PageHeader";
import { SessionGate } from "@/components/SessionGate";
import { useApi } from "@/lib/client/api";

export default function Checks() {
  return <><TopBar /><PageHeader back={{ href: "/", label: "Home" }} title="Session security checks" lead="Run harmless checks against your own local prototype." />
    <main><SessionGate><SessionChecks /></SessionGate></main></>;
}
function SessionChecks() {
  const api = useApi();
  const { getToken } = useTideCloak();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ label: string; result: string }[]>([]);
  async function run() {
    setBusy(true); setRows([]);
    const results: typeof rows = [];
    try {
      await api("GET", "/api/me"); results.push({ label: "Your verified session + fresh DPoP proof", result: "PASS: accepted" });
      const token = await getToken();
      if (!token) throw new Error("No verified session");
      for (const [label, headers] of [
        ["No token", {}], ["Copied token as Bearer", { Authorization: `Bearer ${token}` }],
        ["Copied token without DPoP proof", { Authorization: `DPoP ${token}` }],
      ] as [string, Record<string, string>][]) {
        const r = await fetch("/api/me", { cache: "no-store", headers });
        results.push({ label, result: r.status === 401 ? "PASS: refused (401)" : `FAIL: unexpected status ${r.status}` });
      }
    } catch { results.push({ label: "Session checks", result: "NOT VERIFIED: sign in and retry" }); }
    setRows(results); setBusy(false);
  }
  return <section className="panel"><h2>Token theft checks</h2><p>Tokens stay in memory and are never displayed or logged. Replay timing, wrong-key, URL and method checks run in <code>npm test</code>.</p>
    <button disabled={busy} onClick={run}>{busy ? "Checking…" : "Run session checks"}</button>
    <div className="table-wrap"><table><thead><tr><th>Check</th><th>Observed result</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.label}</td><td>{r.result}</td></tr>)}</tbody></table></div>
    <p className="notice">Passing these checks does not establish clinical, production, or complete security validation.</p>
  </section>;
}
