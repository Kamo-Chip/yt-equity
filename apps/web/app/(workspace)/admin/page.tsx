import { Suspense } from "react";
import {
  AdminModerators,
  type AdminSearchParams,
} from "@/components/features/admin-moderators";
import { AdminPageSkeleton } from "@/components/features/loading-states";
// Session authorization may redirect before the protected page renders.
export const instant = false;
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
