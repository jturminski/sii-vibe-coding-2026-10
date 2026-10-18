import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { pl } from "@/lib/i18n/pl";
import "./globals.css";

// Brand typeface (design-guidelines: Typography). latin-ext covers Polish diacritics.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: pl.form.title,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${montserrat.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
