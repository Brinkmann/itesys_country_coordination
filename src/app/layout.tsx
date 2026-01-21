import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "GovernanceOS",
  description: "Monthly agenda workspace for country coordination."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
