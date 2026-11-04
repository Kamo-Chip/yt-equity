"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { adminLocation, type AdminSection } from "@/lib/admin-query";
import { ApiError } from "@/lib/api";
import { mutateAdmin } from "@/lib/workspace-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

function useAdminNavigation(section: AdminSection) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const update = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const params = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(changes)) {
        const key = section + name[0].toUpperCase() + name.slice(1);
        value === null ? params.delete(key) : params.set(key, value);
      }
      startTransition(() =>
        router[replace ? "replace" : "push"](
          "/admin" + (params.size ? "?" + params : ""),
          { scroll: false },
        ),
      );
    },
    [router, section],
  );
  return { pending, update };
}
export function AdminTableControls({ section }: { section: AdminSection }) {
  const params = useSearchParams();
  const state = adminLocation(new URLSearchParams(params))[section];
  const { pending, update } = useAdminNavigation(section);
  const [search, setSearch] = useState(state.q);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== searchInput.current) setSearch(state.q);
  }, [state.q]);
  useEffect(() => {
    const restore = () =>
      setSearch(
        new URLSearchParams(window.location.search).get(section + "Q") ?? "",
      );
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [section]);
  useEffect(() => {
    if (search === state.q) return;
    const timer = setTimeout(
      () => update({ q: search || null, page: null }, true),
      200,
    );
    return () => clearTimeout(timer);
  }, [search, state.q, update]);
  const status = "status" in state ? state.status : "all";
  return (
    <div className="moderator-toolbar">
      <div className="relative w-full sm:w-64">
        <Search
          className="absolute left-3 top-2.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={searchInput}
          value={search}
          maxLength={120}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 pl-9"
          placeholder="Search by email"
          aria-label={
            section === "users"
              ? "Search active moderators"
              : "Search invitations"
          }
        />
      </div>
      {section === "invitations" && (
        <Select
          value={status}
          disabled={pending}
          onValueChange={(value) =>
            update({ status: value === "all" ? null : value, page: null })
          }
        >
          <SelectTrigger
            aria-label="Invitation status"
            className="h-9 w-auto min-w-36"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["all", "pending", "accepted", "expired", "revoked"].map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {value === "all"
                    ? "All statuses"
                    : value[0].toUpperCase() + value.slice(1)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      )}
      {(state.q || status !== "all") && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setSearch("");
            update({ q: null, status: null, page: null });
          }}
        >
          <X />
          Reset filters
        </Button>
      )}
    </div>
  );
}
export function AdminSort({
  section,
  column,
  label,
  active,
  direction,
}: {
  section: AdminSection;
  column: string;
  label: string;
  active: boolean;
  direction: "asc" | "desc";
}) {
  const { update, pending } = useAdminNavigation(section);
  const Icon = active
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 gap-2 font-medium"
      disabled={pending}
      aria-label={
        "Sort by " +
        label +
        (active && direction === "asc" ? " descending" : " ascending")
      }
      onClick={() =>
        update({
          sort: column,
          direction: active && direction === "asc" ? "desc" : "asc",
          page: null,
        })
      }
    >
      {label}
      <Icon className="size-3.5" aria-hidden="true" />
    </Button>
  );
}
export function AdminPager({
  section,
  page,
  pageSize,
  total,
}: {
  section: AdminSection;
  page: number;
  pageSize: number;
  total: number;
}) {
  const { pending, update } = useAdminNavigation(section);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span role="status">
        {total} record{total === 1 ? "" : "s"} · Page {page} of {pages}
      </span>
      <div className="flex items-center gap-3">
        <Select
          value={String(pageSize)}
          disabled={pending}
          onValueChange={(value) => update({ pageSize: value, page: null })}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="h-8 w-auto text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...new Set([25, 50, 100, pageSize])]
              .sort((a, b) => a - b)
              .map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} per page
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous page"
                disabled={pending || page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                <ChevronLeft />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={pending || page >= pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                <ChevronRight />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
export function AdminInviteForm() {
  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const value = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(value)) {
      setFailure("Enter a complete email address.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setFailure("");
    try {
      await mutateAdmin("moderators/invitations", "POST", { email: value });
      setEmail("");
      toast.success("Invitation sent.");
    } catch (error) {
      setFailure(
        errorMessage(error, "Unable to send this invitation right now."),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-wrap items-start gap-3"
    >
      <Field className="w-full gap-2 sm:max-w-sm" data-invalid={!!failure}>
        <FieldLabel className="leading-5" htmlFor="invite-email">
          Email
        </FieldLabel>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="moderator@example.com"
          value={email}
          disabled={busy}
          aria-invalid={!!failure}
          aria-describedby={failure ? "invite-error" : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setFailure("");
          }}
        />
        {failure && (
          <FieldError id="invite-error" role="alert">
            {failure}
          </FieldError>
        )}
      </Field>
      <Button type="submit" disabled={busy} className="mt-0 h-9 sm:mt-7">
        {busy ? "Sending…" : "Send invitation"}
      </Button>
    </form>
  );
}
export function AdminResend({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function resend() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutateAdmin("moderators/invitations", "POST", { email });
      toast.success("Invitation sent.");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to resend this invitation."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={resend}>
      {busy ? "Sending…" : "Resend"}
    </Button>
  );
}
export function AdminRevoke({ id, email }: { id: string; email: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function revoke() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await mutateAdmin("moderators/" + id + "/revoke", "POST");
      setOpen(false);
      toast.success("Moderator access revoked.");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to revoke access."));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Revoke access
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke moderator access?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately removes workspace access for {email} and ends
              active sessions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              {busy ? "Revoking…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
export function AdminRetry({ message }: { message: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-lg border p-5 text-sm">
      <p role="alert">{message}</p>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        Try again
      </Button>
    </div>
  );
}
