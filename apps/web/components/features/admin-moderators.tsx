import "server-only";
import Link from "next/link";
import { Suspense } from "react";
import type {
  AdminUsersPage,
  AdminInvitationsPage,
  AdminUsersQuery,
  AdminInvitationsQuery,
} from "@yt-equity/contracts";
import { adminLocation, type AdminSection } from "@/lib/admin-query";
import { adminRead } from "@/lib/admin-data";
import { getWorkspaceSession } from "@/lib/server-api";
import { ApiError } from "@/lib/api";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  AdminInviteForm,
  AdminTableControls,
  AdminSort,
  AdminPager,
  AdminResend,
  AdminRevoke,
  AdminRetry,
} from "./admin-controls";
import { ModeratorTableSkeleton } from "./loading-states";
export type AdminSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;
export async function AdminModerators({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  let session;
  try {
    session = await getWorkspaceSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401)
      redirect("/moderator/sign-in");
    throw error;
  }
  if (session.role !== "admin")
    return (
      <main className="workspace-page moderator-page">
        <h1 className="workspace-heading mb-3">
          Administrator access required
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Your account can access the moderation workspace.
        </p>
        <Button asChild variant="outline">
          <Link href="/moderator">Return to inbox</Link>
        </Button>
      </main>
    );
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
  const state = adminLocation(params);
  return (
    <main className="workspace-page moderator-page admin-page">
      <header className="moderator-page-header">
        <h1 className="workspace-heading">Moderators</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage workspace access and moderator invitations.
        </p>
      </header>
      <Card className="moderator-card gap-4 p-4 shadow-none">
        <div>
          <h2 className="text-base font-medium">Invite moderator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send an invitation to join the moderation workspace.
          </p>
        </div>
        <AdminInviteForm />
      </Card>
      <section
        className="admin-table-section"
        aria-labelledby="admin-users-heading"
      >
        <h2 id="admin-users-heading" className="mb-3 text-base font-medium">
          Active moderators
        </h2>
        <AdminTableControls section="users" />
        <Suspense
          key={JSON.stringify(state.users)}
          fallback={
            <ModeratorTableSkeleton label="Loading active moderators" />
          }
        >
          <UsersTable query={state.users} />
        </Suspense>
      </section>
      <section
        className="admin-table-section"
        aria-labelledby="admin-invitations-heading"
      >
        <h2
          id="admin-invitations-heading"
          className="mb-3 text-base font-medium"
        >
          Invitation history
        </h2>
        <AdminTableControls section="invitations" />
        <Suspense
          key={JSON.stringify(state.invitations)}
          fallback={<ModeratorTableSkeleton label="Loading invitations" />}
        >
          <InvitationsTable query={state.invitations} />
        </Suspense>
      </section>
    </main>
  );
}
async function readTable<T>(
  endpoint: string,
  query: object,
): Promise<{ data: T } | { failure: string }> {
  try {
    return {
      data: await adminRead<T>(
        endpoint +
          "?" +
          new URLSearchParams(
            Object.entries(query).map(([key, value]) => [key, String(value)]),
          ),
      ),
    };
  } catch (error) {
    if (error instanceof ApiError)
      return {
        failure:
          error.status === 403
            ? "Administrator access required."
            : "Couldn’t load this section. Try again.",
      };
    if (error instanceof TypeError && error.message === "fetch failed")
      return { failure: "Couldn’t reach the service. Try again." };
    throw error;
  }
}
function SortHead({
  section,
  column,
  label,
  query,
}: {
  section: AdminSection;
  column: string;
  label: string;
  query: { sort: string; direction: "asc" | "desc" };
}) {
  return (
    <TableHead
      aria-label={label}
      aria-sort={
        query.sort === column
          ? query.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <AdminSort
        section={section}
        column={column}
        label={label}
        active={query.sort === column}
        direction={query.direction}
      />
    </TableHead>
  );
}
async function UsersTable({ query }: { query: AdminUsersQuery }) {
  const result = await readTable<AdminUsersPage>("users", query);
  if ("failure" in result) return <AdminRetry message={result.failure} />;
  const { data } = result;
  return (
    <Card className="moderator-card moderator-table gap-0 overflow-hidden py-0 shadow-none">
      <Table aria-label="Active moderators" className="admin-users-table">
        <TableHeader className="bg-muted/50">
          <TableRow>
            <SortHead
              section="users"
              column="email"
              label="Email"
              query={query}
            />
            <SortHead
              section="users"
              column="createdAt"
              label="Account created"
              query={query}
            />
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((person) => (
            <TableRow key={person.id}>
              <TableCell className="font-medium">{person.email}</TableCell>
              <TableCell className="text-muted-foreground">
                {date(person.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <AdminRevoke id={person.id} email={person.email} />
              </TableCell>
            </TableRow>
          ))}
          {!data.items.length && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground"
              >
                {query.q ? "No matching moderators." : "No active moderators."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <AdminPager
        section="users"
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
    </Card>
  );
}
async function InvitationsTable({ query }: { query: AdminInvitationsQuery }) {
  const result = await readTable<AdminInvitationsPage>("invitations", query);
  if ("failure" in result) return <AdminRetry message={result.failure} />;
  const { data } = result;
  return (
    <Card className="moderator-card moderator-table gap-0 overflow-hidden py-0 shadow-none">
      <Table
        aria-label="Invitation history"
        className="admin-invitations-table"
      >
        <TableHeader className="bg-muted/50">
          <TableRow>
            <SortHead
              section="invitations"
              column="email"
              label="Email"
              query={query}
            />
            <SortHead
              section="invitations"
              column="status"
              label="Status"
              query={query}
            />
            <SortHead
              section="invitations"
              column="lastSentAt"
              label="Last sent"
              query={query}
            />
            <SortHead
              section="invitations"
              column="expiresAt"
              label="Expires"
              query={query}
            />
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="rounded-md font-normal capitalize"
                >
                  {invitation.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {date(invitation.lastSentAt, true)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {date(invitation.expiresAt)}
              </TableCell>
              <TableCell className="text-right">
                {["pending", "expired"].includes(invitation.status) && (
                  <AdminResend email={invitation.email} />
                )}
              </TableCell>
            </TableRow>
          ))}
          {!data.items.length && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-muted-foreground"
              >
                {query.q || query.status !== "all"
                  ? "No matching invitations."
                  : "No invitations yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <AdminPager
        section="invitations"
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
      />
    </Card>
  );
}
function date(value: string | null, time = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(time
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }
      : {}),
    timeZone: "Africa/Johannesburg",
  })
    .format(new Date(value))
    .replace("Sept", "Sep");
}
