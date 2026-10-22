import { STUDY } from "@/lib/fixtures";

/** Landing-page sections. */
export function About() {
  return (
    <>
      <main id="how">
        <section className="panel">
          <h2>How it works</h2>
          <p className="title">Your sample stays sealed until you say who.</p>
          <ol className="steps">
            <li><strong>Encrypted in your browser</strong>Each sample is locked before upload. The server only ever stores ciphertext.</li>
            <li><strong>Sealed to you</strong>The key is tied to your Tide identity. No administrator or server operator holds a key that opens it.</li>
            <li><strong>Shared with one person</strong>Your browser makes one key copy that only the researcher you name can open.</li>
            <li><strong>Taken back</strong>Withdraw and the server stops serving it, re-locks it with a new key and deletes their copy. What they already read stays with them.</li>
          </ol>
        </section>
      </main>
      <section className="dark-section">
        <div className="wrap">
          <h2>The study</h2>
          <p className="title">{STUDY.title}</p>
          <p>{STUDY.purpose}</p>
          <p className="hand">Six synthetic samples in English, Vietnamese and both.</p>
        </div>
      </section>
    </>
  );
}
