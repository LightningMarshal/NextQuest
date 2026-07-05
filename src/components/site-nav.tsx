"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, ShieldIcon } from "lucide-react";

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

function UserMenu({ user }: { user: NavUser }) {
	const router = useRouter();

	async function handleSignOut() {
		await authClient.signOut();
		router.push("/sign-in");
		router.refresh();
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
					{user.image ? (
						<Image
							src={user.image}
							alt={user.name}
							width={28}
							height={28}
							className="size-7 rounded-full"
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
			<div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
				<Link href="/" className="flex items-center gap-2.5">
					<ChevronMark className="text-foreground size-6" />
					<span className="font-display text-base font-semibold tracking-tight">NextQuest</span>
					<span className="text-muted-foreground border-border ml-1 hidden rounded-full border px-2 py-0.5 text-xs sm:inline">
						{groupName}
					</span>
				</Link>
				<nav className="flex items-center gap-1 text-sm">
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
