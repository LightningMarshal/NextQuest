import { ChevronMark } from "@/components/chevron-mark";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="flex min-h-svh flex-col">
			<header className="flex h-14 items-center justify-between px-4">
				<span className="flex items-center gap-2.5">
					<ChevronMark className="text-foreground size-6" />
					<span className="font-display text-base font-semibold tracking-tight">NextQuest</span>
				</span>
				<ThemeToggle />
			</header>
			<main className="mx-auto w-full max-w-5xl flex-1 px-4">{children}</main>
		</div>
	);
}
