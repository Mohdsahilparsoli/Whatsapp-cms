import { Bricolage_Grotesque } from "next/font/google";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={display.variable}>{children}</div>;
}
