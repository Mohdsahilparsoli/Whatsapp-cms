import type { Metadata } from "next";
import { Archivo, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

// Body/UI text matches the GrowVika website; the wordmark uses Archivo at
// its widest setting, which is what the logo is drawn in.
const sans = Plus_Jakarta_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
});
const brand = Archivo({
  variable: "--font-brand",
  subsets: ["latin"],
  axes: ["wdth"],
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
