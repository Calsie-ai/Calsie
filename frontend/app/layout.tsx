import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Symbiote Applix",
  description: "AI employment symbiote",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
