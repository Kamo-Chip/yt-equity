import type { Metadata } from "next";
import { Suspense } from "react";
import {
  AdminModerators,
  type AdminSearchParams,
} from "@/components/features/admin-moderators";
import { AdminPageSkeleton } from "@/components/features/loading-states";
// Session authorization may redirect before the protected page renders.
export const instant = false;
export const metadata: Metadata = { title: "Administrator workspace" };

export default function AdminPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  return (
    <Suspense fallback={<AdminPageSkeleton />}>
      <AdminModerators searchParams={searchParams} />
    </Suspense>
  );
}
