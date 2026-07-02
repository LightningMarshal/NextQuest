import type { Metadata } from "next";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

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
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body className="font-sans antialiased">
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
