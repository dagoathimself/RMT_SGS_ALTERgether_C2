"use client";

import { TideCloakProvider } from "@tidecloak/nextjs";
import { useEffect, useState, type ComponentProps } from "react";
import { usePathname } from "next/navigation";

// The provider takes the adapter JSON directly as the config prop.
// useDPoP goes inside the config object, not as a separate JSX prop (I-12).
export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The public simulation is a separate, synthetic-only surface. It never mounts
  // the identity provider and cannot be used as authentication for the live API.
  if (pathname === "/demo") return children;
  return <LiveProvider>{children}</LiveProvider>;
}

function LiveProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ComponentProps<typeof TideCloakProvider>["config"] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error("not configured"); return r.json(); })
      .then((d) => setConfig(d.config))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (!config) return <main>
    <section className="panel">
      <img src="/altergether-logo.svg" width="300" height="70" alt="ALTERGETHER" />
      <h1>{failed ? "Connect your TideCloak realm" : "Checking configuration…"}</h1>
      <p>One language sample. One named researcher. Consent you can withdraw.</p>
      {failed && <>
        <p className="notice">Live sign-in needs your local TideCloak setup. Protected routes remain locked.</p>
        <p>Follow the README: <code>npm ci</code>, copy <code>.env.example</code> to <code>.env</code>, then run <code>npm run init</code>.</p>
        <p>Human account enrolment is required before testing live Tide encryption.</p>
        <a className="btn" href="/demo">Explore the labelled simulation</a>
      </>}
    </section>
  </main>;
  return (
    <TideCloakProvider
      config={{ ...config, useDPoP: { mode: "strict", alg: "ES256" } }}
    >
      {children}
    </TideCloakProvider>
  );
}
