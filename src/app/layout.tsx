import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Itesys - Country Coordination",
  description: "Monthly agenda workspace for country coordination."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
