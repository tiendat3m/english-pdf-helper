import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS PDF Notes",
  description: "A local-first IELTS PDF learning workspace for notes, highlights, vocabulary, and progress."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
