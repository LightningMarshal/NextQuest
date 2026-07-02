import { redirect } from "next/navigation";

// Voting moved into the picker (/pick) — the ballot and the ranking it
// feeds now live on one page. Kept as a redirect so old links survive.
export default function VotePage() {
	redirect("/pick");
}
