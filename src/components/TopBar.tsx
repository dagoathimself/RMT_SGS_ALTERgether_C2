"use client";
import { useTideCloak } from "@tidecloak/nextjs";
import { Brand } from "./Brand";

export function TopBar() {
  const { authenticated, logout, getValueFromIdToken, hasRealmRole } = useTideCloak();
  return (
    <header className="top">
      <Brand />
      <nav aria-label="Main">
        {authenticated && hasRealmRole("participant") && <a href="/participant">Contributions</a>}
        {authenticated && hasRealmRole("researcher") && <a href="/researcher">Shared with me</a>}
        {authenticated && <span className="who">{String(getValueFromIdToken("preferred_username") ?? "")}</span>}
        {authenticated && <button className="secondary" onClick={() => logout()}>Sign out</button>}
      </nav>
    </header>
  );
}
