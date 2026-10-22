"use client";
import { FIXTURES, type Fixture } from "@/lib/fixtures";

const LANG = { en: "English", vi: "Vietnamese", mixed: "Mixed Vietnamese-English" } as const;

function Check() {
  return (
    <span className="sample-check" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
}

/** The six synthetic samples as colour-coded cards: green = English, red = Vietnamese, orange = mixed. */
export function SampleCards({ selectedId, contributed, onPreview, anchorId = "pick" }: {
  selectedId?: string;
  contributed: Set<string | null>;
  onPreview: (f: Fixture) => void;
  anchorId?: string;
}) {
  const open = (f: Fixture) => {
    onPreview(f);
    // the preview opens ABOVE the cards: bring it into view
    requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <div className="grid samples">
      {FIXTURES.map((f) => {
        const isSel = selectedId === f.id;
        const done = contributed.has(f.id);
        return (
          <div key={f.id} className={`sample-card lang-${f.language}${isSel ? " selected" : ""}${done ? " done" : ""}`}>
            {(isSel || done) && <Check />}
            <div>
              <h3>{f.label}</h3>
              <span className="sample-meta">{LANG[f.language]} · synthetic</span>
            </div>
            {done
              ? <span className="sample-done">Contributed</span>
              : <button className="sample-btn" onClick={() => open(f)} aria-pressed={isSel}>Preview</button>}
          </div>
        );
      })}
    </div>
  );
}
