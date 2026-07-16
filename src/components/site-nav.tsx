"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, MenuIcon, ShieldIcon, SparklesIcon } from "lucide-react";

import { ChevronMark } from "@/components/chevron-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { REPLAY_EVENT } from "@/components/welcome-tour";

const links = [
	{ href: "/", label: "Dashboard" },
	{ href: "/backlog", label: "Backlog" },
	{ href: "/pick", label: "What's next?" },
	{ href: "/events", label: "Events" },
];

export type NavUser = {
	name: string;
	email: string;
	image: string | null;
	isAdmin: boolean;
};

/** Below `sm` the four links collapse behind this menu (issue #22) — the
 * bar otherwise overflows on phones, where a session app actually lives. */
function MobileNav({ pathname }: { pathname: string }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open navigation">
					<MenuIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-44 sm:hidden">
				{links.map((link) => (
					<DropdownMenuItem key={link.href} asChild>
						<Link
							href={link.href}
							className={cn(pathname === link.href && "bg-primary/12 text-primary font-medium")}
						>
							{link.label}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UserMenu({ user }: { user: NavUser }) {
	const router = useRouter();
	// Issue #7: Google's avatar host rejects requests carrying a Referer
	// (429/403), so the image must be fetched with no referrer — and if it
	// still fails (stale URL), fall back to the initial instead of showing
	// the browser's broken-image icon.
	const [imageFailed, setImageFailed] = useState(false);

	async function handleSignOut() {
		await authClient.signOut();
		router.push("/sign-in");
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
					{user.image && !imageFailed ? (
						<Image
							src={user.image}
							alt={user.name}
							width={28}
							height={28}
							className="size-7 rounded-full"
							referrerPolicy="no-referrer"
							onError={() => setImageFailed(true)}
							unoptimized
						/>
					) : (
						<span className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold uppercase">
							{user.name.charAt(0) || "?"}
						</span>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-48">
				<DropdownMenuLabel>
					<div className="flex flex-col gap-0.5">
						<span>{user.name}</span>
						<span className="text-muted-foreground text-xs font-normal">{user.email}</span>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{user.isAdmin && (
					<DropdownMenuItem asChild>
						<Link href="/admin">
							<ShieldIcon />
							Admin
						</Link>
					</DropdownMenuItem>
				)}
				<DropdownMenuItem
					onClick={() => window.dispatchEvent(new CustomEvent(REPLAY_EVENT))}
				>
					<SparklesIcon />
					Replay the tour
				</DropdownMenuItem>
				<DropdownMenuItem onClick={handleSignOut}>
					<LogOutIcon />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function SiteNav({ user, groupName }: { user: NavUser; groupName: string }) {
	const pathname = usePathname();

	return (
		<header className="border-b sticky top-0 z-40 bg-background/80 backdrop-blur">
			<div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-6">
				<MobileNav pathname={pathname} />
				<Link href="/" className="flex items-center gap-2.5">
					<ChevronMark className="text-foreground size-6" />
					<span className="font-display text-base font-semibold tracking-tight">NextQuest</span>
					<span className="text-muted-foreground border-border ml-1 hidden rounded-full border px-2 py-0.5 text-xs sm:inline">
						{groupName}
					</span>
				</Link>
				<nav className="hidden items-center gap-1 text-sm sm:flex">
					{links.map((link) => {
						const active = pathname === link.href;
						return (
							<Link
								key={link.href}
								href={link.href}
								className={cn(
									"rounded-lg px-3 py-1.5 font-medium transition-colors",
									active
										? "bg-primary/12 text-primary"
										: "text-muted-foreground hover:text-foreground hover:bg-card"
								)}
							>
								{link.label}
							</Link>
						);
					})}
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle />
					<UserMenu user={user} />
				</div>
			</div>
		</header>
	);
}
