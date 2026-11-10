import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";
import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

// Nova type system: Space Grotesk (display/headings), Hanken Grotesk (body/UI),
// JetBrains Mono (every numeric stat). Wired to the CSS vars used in globals.css.
// The variable classes live on <html>: the @theme aliases (--font-mono etc.) are
// emitted at :root, and custom properties resolve where declared — on <body>
// they'd compute to invalid at :root and the aliases would silently fail.
const fontDisplay = Space_Grotesk({
	variable: "--font-display-nq",
	subsets: ["latin"],
	weight: ["500", "600", "700"],
});

const fontSans = Hanken_Grotesk({
	variable: "--font-sans-nq",
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
});

const fontMono = JetBrains_Mono({
	variable: "--font-mono-nq",
	subsets: ["latin"],
	weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
	title: {
		default: "NextQuest",
		template: "%s · NextQuest",
	},
	description: "Track and coordinate gaming with friends.",
	// Installable (Phase 23): the manifest itself is src/app/manifest.ts.
	applicationName: "NextQuest",
	appleWebApp: { capable: true, title: "NextQuest", statusBarStyle: "black-translucent" },
	icons: {
		icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
		apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
	},
};

export const viewport: Viewport = {
	// The browser/OS chrome around an installed app, per theme.
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#0B0D11" },
		{ media: "(prefers-color-scheme: light)", color: "#F3F5F8" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
		>
			<body className="font-sans antialiased">
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
					{children}
				</ThemeProvider>
				<ServiceWorker />
			</body>
		</html>
	);
}
