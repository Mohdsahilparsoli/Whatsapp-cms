import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";

// Headlines use the same face as the GrowVika website; the italic serif is
// its signature accent.
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], weight: ["800"] });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: "italic" });

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${display.variable} ${serif.variable}`}>{children}</div>;
}
