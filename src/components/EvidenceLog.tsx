"use client";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/client/api";

interface Entry { seq: number; ts: string; source: string; actorName: string | null; action: string; contributionId?: string; grantId?: string; result: string; detail?: string }

// Restricted view: the server only returns entries about the caller's own contributions/actions.
// Contribution text and tokens are never written to the log.
export function EvidenceLog({ refreshKey = 0 }: { refreshKey?: number }) {
  const api = useApi();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ entries: Entry[] }>("GET", "/api/evidence")
      .then((d) => { setEntries(d.entries.slice().reverse()); setErr(""); })
      .catch(() => setErr("Evidence log could not be loaded."));
  }, [api, refreshKey]);
  return (
    <details className="panel">
      <summary>Activity log</summary>
      <p className="muted small" style={{ marginTop: 16 }}>
        Only events about you, recorded by the app server. It is an activity record, not a tamper-proof audit trail.
        <em> Client-reported</em> rows come from a browser, not a server decision.
      </p>
      {err && <div className="notice bad">{err}</div>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>
            {entries.slice(0, 60).map((e) => (
              <tr key={e.seq}>
                <td>{e.seq}</td>
                <td className="mono">{new Date(e.ts).toLocaleTimeString()}</td>
                <td>{e.actorName ?? "anonymous"}</td>
                <td>{e.action}{e.source === "client-reported" ? <span className="muted"> (client-reported)</span> : null}</td>
                <td><strong>{e.result}</strong></td>
                <td className="mono">{[e.contributionId, e.detail].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
