import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RentSathi · Property Manager",
  description: "Secure property, tenant, rent and electricity management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
