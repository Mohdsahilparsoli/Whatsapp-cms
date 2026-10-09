import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

// Body/UI text matches the GrowVika website; the wordmark uses Syne, the
// same face as the logo on the website.
const sans = Plus_Jakarta_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
});
const brand = Syne({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: { default: "GrowVika WhatsApp CMS", template: "%s · GrowVika" },
  description: "Run WhatsApp campaigns, templates, contacts and a shared inbox from one GrowVika workspace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${brand.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
