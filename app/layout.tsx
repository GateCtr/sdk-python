import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Syne, Geist } from "next/font/google";
import { cookies, headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkProvider } from "@/components/clerk-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactQueryProvider } from "@/components/query-provider";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://gatectr.com",
  ),
  alternates: {
    canonical: process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://gatectr.com",
  },
  title: "GateCtr - Control Your LLM Costs",
  description:
    "Universal middleware hub for controlling, optimizing, and securing API calls to LLMs",
  keywords: ["LLM", "AI", "cost control", "token optimization", "API gateway"],
  authors: [{ name: "GateCtr" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GateCtr",
  },
  openGraph: {
    title: "GateCtr - Control Your LLM Costs",
    description:
      "Universal middleware hub for controlling, optimizing, and securing API calls to LLMs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GateCtr - Control Your LLM Costs",
    description:
      "Universal middleware hub for controlling, optimizing, and securing API calls to LLMs",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Derive locale from URL pathname first, fall back to cookie
  const headerStore = await headers();
  const pathname =
    headerStore.get("x-pathname") ?? headerStore.get("x-invoke-path") ?? "";
  const localeFromPath = pathname.startsWith("/fr") ? "fr" : null;
  const cookieStore = await cookies();
  const locale =
    localeFromPath ?? cookieStore.get("NEXT_LOCALE")?.value ?? "en";

  return (
    <html
      lang={locale}
      className={cn(
        inter.variable,
        jetbrainsMono.variable,
        syne.variable,
        "font-sans",
        geist.variable,
      )}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider locale={locale}>
            <ReactQueryProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </ReactQueryProvider>
          </ClerkProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
