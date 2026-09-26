import { redirect } from "next/navigation";

// Superseded by /apply (membership applications). Kept as a redirect for
// old links and bookmarks.
export default function PendingApprovalPage() {
	redirect("/apply");
}
