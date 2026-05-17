import "./globals.css";

export const metadata = {
  title: "Symbiote Applix",
  description: "AI employment symbiote",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
