import type { ReactNode } from "react";

// State is always conveyed by a symbol AND words, never by colour alone.
const MAP: Record<string, { cls: string; sym: string; label: string; help: string }> = {
  pending: { cls: "warn", sym: "◔", label: "Pending", help: "Consent recorded. Access is not active until the key wrap is stored." },
  active: { cls: "ok", sym: "✓", label: "Active", help: "The named researcher can decrypt this contribution." },
  denied: { cls: "bad", sym: "✕", label: "Denied", help: "This grant was not activated." },
  withdrawal_pending: { cls: "warn", sym: "◔", label: "Withdrawal pending", help: "The server has stopped serving it. Waiting for re-key and a denial check." },
  withdrawn: { cls: "info", sym: "⊘", label: "Withdrawn", help: "Re-keyed; the researcher's key copy was deleted; a fresh access check was refused." },
  allowed: { cls: "ok", sym: "✓", label: "Allowed", help: "" },
  error: { cls: "bad", sym: "!", label: "Could not verify", help: "" },
};

export function StateBadge({ state, children }: { state: string; children?: ReactNode }) {
  const m = MAP[state] ?? { cls: "info", sym: "•", label: state, help: "" };
  return (
    <span className={`badge ${m.cls}`} title={m.help}>
      <span aria-hidden="true">{m.sym}</span> {children ?? m.label}
    </span>
  );
}

