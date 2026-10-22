"use client";
import { useTideCloak } from "@tidecloak/nextjs";
import { TopBar } from "@/components/TopBar";
import { Logo, SignInLabel } from "@/components/Brand";
import { About } from "@/components/About";
import { TideStatus } from "@/components/TideStatus";

export default function Home() {
  const { authenticated, login, isInitializing, initError, hasRealmRole } = useTideCloak();
  return (
    <>
      <TopBar />
      <section className="hero">
        <div className="wrap">
          <div>
            <h1 className="hero-title"><Logo height={84} /></h1>
            <p className="premise">Share one language sample with one researcher. Keep the rest.</p>
            <p className="sub">You choose who reads which sample, and you can stop sharing. Administrators and the server hold no key that opens it.</p>
            <div className="cta">
              {isInitializing && <span className="sub">Checking your session…</span>}
              {initError && <p className="notice bad">Sign-in could not be reached, so nothing protected is shown.</p>}
              {!isInitializing && !authenticated && <button className="signin" onClick={() => login()}><SignInLabel /></button>}
              {authenticated && hasRealmRole("participant") && <a className="btn" href="/participant">My contributions</a>}
              {authenticated && hasRealmRole("researcher") && <a className="btn" href="/researcher">Shared with me</a>}
              {authenticated && !hasRealmRole("participant") && !hasRealmRole("researcher") && (
                <span className="sub">This account has no portal role. Admin roles never grant access to contributions.</span>
              )}
              <a className="btn secondary" href="#how">How it works</a>
            </div>
            <TideStatus />
            <p className="hand">Your words stay yours. Even the admins have to ask.</p>
          </div>
          <figure className="hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/hero-illustration.svg" width={977} height={370} alt="A participant hands one sealed message to one researcher, while her other messages stay with her" />
          </figure>
        </div>
      </section>
      <About />
    </>
  );
}
