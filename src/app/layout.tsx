import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "ALTERGETHER",
  description: "Participants share selected synthetic language samples with a named researcher; one administrator cannot grant themselves access.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
