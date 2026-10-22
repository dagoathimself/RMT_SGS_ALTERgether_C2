"use client";
import { useEffect, useState } from "react";

interface Probe { ok: boolean; ms: number; detail: string }
interface Status { realm: string | null; tidecloak: Probe; tideNetwork: Probe; checkedAt: string }

/** Live TideCloak + Tide network status, from the server's /api/status check. */
export function TideStatus() {
  const [s, setS] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) { setS(d); setFailed(false); } }).catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const row = (label: string, p?: Probe) => (
    <li className={`tide-status-item ${p ? (p.ok ? "up" : "down") : ""}`}>
      <span aria-hidden="true">{p ? (p.ok ? "●" : "✕") : "○"}</span>
      <strong>{label}</strong>
      <span>{p ? (p.ok ? `online · ${p.ms} ms` : p.detail) : "checking…"}</span>
    </li>
  );
  const down = failed || (s && (!s.tidecloak.ok || !s.tideNetwork.ok));
  return (
    <div className="tide-status" role="status" aria-live="polite">
      <ul>
        {row(s?.realm ? `TideCloak realm "${s.realm}"` : "TideCloak realm", failed ? { ok: false, ms: 0, detail: "unreachable" } : s?.tidecloak)}
        {row("Tide network", failed ? undefined : s?.tideNetwork)}
      </ul>
      {down && <p className="small">A dependency check failed. Live sign-in or encryption may be unavailable; reachability alone does not verify either operation.</p>}
    </div>
  );
}
