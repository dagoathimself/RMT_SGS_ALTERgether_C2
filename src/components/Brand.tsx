/* eslint-disable @next/next/no-img-element */
export const PRODUCT = "ALTERGETHER";

/** The ALTERGETHER wordmark: vector (public/altergether-logo.svg), sharp at any size or screen density. */
export function Logo({ height = 26, className }: { height?: number; className?: string }) {
  return <img src="/altergether-logo.svg" alt={PRODUCT} width={Math.round(height * 2788 / 500)} height={height} className={className} />;
}

/** Header lockup: ALTERGETHER, then the RMIT and Tide partner marks (dark variants of the
 *  official files served on tide.org/unlocked). */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <div className="lockup">
      <a href={href} className="brand" aria-label={`${PRODUCT} home`}>
        <Logo />
      </a>
      <span className="lockup-rule" aria-hidden="true" />
      <img src="/brand/rmit-logo-dark.svg" alt="RMIT University" className="partner rmit" width={86} height={30} />
      <span className="lockup-rule" aria-hidden="true" />
      <img src="/brand/tide-logo-dark.svg" alt="Tide" className="partner tide" width={44} height={23} />
    </div>
  );
}

/** "Sign in with [TideCloak]" label: the product name is the official TideCloak wordmark. */
export function SignInLabel() {
  return (
    <>
      Sign in with
      <img src="/brand/tidecloak-white.svg" alt="TideCloak" className="tc-mark" width={110} height={15} />
    </>
  );
}
