import { redirect } from "next/navigation";
import { getWorkspaceSession } from "@/lib/server-api";
// Authorization can redirect before this page is allowed to render.
export const instant = false;
export default async function WorkspacePage() {
  const session = await getWorkspaceSession();
  redirect(session.role === "admin" ? "/admin" : "/moderator");
}
