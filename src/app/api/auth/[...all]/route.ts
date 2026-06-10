import { getAuth } from "@/lib/auth";

// Better Auth handles all /api/auth/* routes (sign-in, callback, session…).
// The instance is built per request because env bindings are request-scoped
// on Workers, so we can't use toNextJsHandler's static export form.
async function handler(request: Request) {
	return getAuth().handler(request);
}

export { handler as GET, handler as POST };
