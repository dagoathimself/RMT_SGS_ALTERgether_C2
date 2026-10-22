import "./globals.css";
import { Google_Sans, Fira_Mono, Caveat } from "next/font/google";
import { Providers } from "./providers";

// Google Sans (opsz 17..18, wght 400..700, normal + italic), the same family and axes as the Google Fonts
// stylesheet link. next/font downloads it at build time and serves it from this site, so visitors'
// browsers never contact Google. The Vietnamese subset keeps diacritics in the same typeface.
const sans = Google_Sans({ subsets: ["latin", "latin-ext", "vietnamese"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-google-sans", display: "swap", adjustFontFallback: false });
const mono = Fira_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono", display: "swap" });
const hand = Caveat({ subsets: ["latin", "latin-ext"], weight: ["600"], variable: "--font-hand", display: "swap" });

export const metadata = {
  title: "ALTERGETHER",
  description: "Participants share selected synthetic language samples with a named researcher; one administrator cannot grant themselves access.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
