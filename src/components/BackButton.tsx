"use client";
/** Icon-only "back" control. The label is still spoken by screen readers and shown as a tooltip. */
function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

export function BackButton({ label, href, onClick, onDark }: { label: string; href?: string; onClick?: () => void; onDark?: boolean }) {
  const cls = `icon-back${onDark ? " on-dark" : ""}`;
  if (href) return <a className={cls} href={href} aria-label={label} title={label}><Arrow /></a>;
  return <button type="button" className={cls} onClick={onClick} aria-label={label} title={label}><Arrow /></button>;
}
