"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function InvitationStatus({ message, failed = false }: { message: string; failed?: boolean }) {
  return (
    <main className="auth-card">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Private workspace</p>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Moderator invitation</h1>
      <p role={failed ? "alert" : "status"} className="text-sm leading-6 text-muted-foreground">{message}</p>
      {failed && <Button asChild variant="outline" className="mt-6"><Link href="/moderator/sign-in">Back to sign in</Link></Button>}
    </main>
  );
}
function AcceptInvitation() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState({ message: "Activating moderator access…", failed: false });
  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState({ message: "This invitation link is invalid. Request a new invitation from an admin.", failed: true });
      return;
    }
    fetch("/api/v1/invitations/accept", {
      method: "POST", credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((response) => {
      if (!response.ok) throw new Error();
      router.replace("/moderator");
    }).catch(() => setState({ message: "We could not activate this invitation. Request a new invitation from an admin.", failed: true }));
  }, [params, router]);
  return <InvitationStatus {...state} />;
}
export default function AcceptInvitationPage() {
  return <Suspense fallback={<InvitationStatus message="Loading invitation…" />}><AcceptInvitation /></Suspense>;
}
