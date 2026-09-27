import { redirect } from "next/navigation";

// /vote and /pick were retired in the 2026-09 redesign ("keen" on the
// library replaced budget voting and the picker). Old links land there.
export default function VoteRedirect() {
	redirect("/backlog");
}
