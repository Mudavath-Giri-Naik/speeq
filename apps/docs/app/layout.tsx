import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { AssistantProvider } from "../components/assistant/assistant-provider";
import { Enhancer } from "../components/enhancer";
import { Footer } from "../components/footer";
import { Header } from "../components/header";
import { SmoothScroll } from "../components/smooth-scroll";
import { themeScript } from "../components/theme-toggle";
import { siteUrl } from "../lib/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["600", "700", "800"],
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "speeq: give your website a voice", template: "%s · speeq" },
  description:
    "speeq is a headless voice and text assistant for web apps. It talks, opens pages and answers from your own data, with your model and your design.",
  applicationName: "speeq",
  keywords: ["speeq", "voice assistant", "conversational AI", "Next.js", "React", "SDK"],
  openGraph: { type: "website", siteName: "speeq", title: "speeq: give your website a voice" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable} ${jakarta.variable} ${bricolage.variable} ${instrument.variable} no-js`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme bootstrap, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <AssistantProvider>
          <SmoothScroll />
          <Header />
          <div id="main" tabIndex={-1} className="outline-none">
            {children}
          </div>
          <Footer />
          <Enhancer />
        </AssistantProvider>
      </body>
    </html>
  );
}
