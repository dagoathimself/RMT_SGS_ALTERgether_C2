"use client";
import { useTideCloak } from "@tidecloak/nextjs";
export function SessionGate({ role, children }: { role?: string; children: React.ReactNode }) {
  const { authenticated, isInitializing, initError, login, hasRealmRole, hasClientRole } = useTideCloak();
  if (isInitializing) return <p className="notice">Checking your Tide session…</p>;
  if (initError) return <p className="notice bad">Tide sign-in is unavailable. Protected content stays locked.</p>;
  if (!authenticated) return <section className="panel"><p>Sign in with your own Tide identity to continue.</p><button onClick={() => login()}>Sign in with TideCloak</button></section>;
  if (role && !hasRealmRole(role) && !hasClientRole(role)) return <p className="notice bad">This account needs the {role} role. Administrator roles do not grant contribution access.</p>;
  return children;
}
