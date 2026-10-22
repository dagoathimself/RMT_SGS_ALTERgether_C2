"use client";
import { useTideCloak } from "@tidecloak/nextjs";
import { Brand } from "./Brand";

export function TopBar() {
  const { authenticated, logout, getValueFromIdToken, hasRealmRole, hasClientRole } = useTideCloak();
  return (
    <header className="top">
      <Brand />
      <nav aria-label="Main">
        {authenticated && (hasRealmRole("participant") || hasClientRole("participant")) && <a href="/participant">Contributions</a>}
        {authenticated && (hasRealmRole("researcher") || hasClientRole("researcher")) && <a href="/researcher">Shared with me</a>}
        <a href="/demo">Simulation</a>
        {authenticated && <a href="/checks">Security checks</a>}
        {authenticated && <span className="who">{String(getValueFromIdToken("preferred_username") ?? "")}</span>}
        {authenticated && <button className="secondary" onClick={() => logout()}>Sign out</button>}
      </nav>
    </header>
  );
}
