import type { ReactNode } from "react";
import { BackButton } from "./BackButton";

/** Teal band at the top of every inner page, with a visible way back. */
export function PageHeader({ back, eyebrow, title, lead, hand, children }: {
  back: { href: string; label: string };
  eyebrow?: string;
  title: string;
  lead?: string;
  hand?: string;
  children?: ReactNode;
}) {
  return (
    <div className="band">
      <div className="wrap">
        <BackButton href={back.href} label={back.label} onDark />
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {hand && <p className="hand">{hand}</p>}
        {children}
      </div>
    </div>
  );
}
