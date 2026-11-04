"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type {
  ModeratorInbox,
  ModeratorChannel,
  ModeratorFirm,
  ModeratorRelationship,
  SubmissionContext,
} from "@yt-equity/contracts";
import { ApiError } from "@/lib/api";
import { mutateModerator } from "@/lib/workspace-mutation";
import { moderatorLocation } from "@/lib/moderator-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { RelationshipEditor } from "./relationship-editor";
import { EntityEditor } from "./entity-editor";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  X,
} from "lucide-react";

type Changes = Record<string, string | null>;
const NavigationContext = createContext<{
  pending: boolean;
  update: (changes: Changes, replace?: boolean) => void;
  refresh: () => void;
} | null>(null);
export function ModeratorNavigation({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function update(changes: Changes, replace = false) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes))
      value === null ? next.delete(key) : next.set(key, value);
    startTransition(() =>
      router[replace ? "replace" : "push"](
        "/moderator" + (next.size ? "?" + next : ""),
        { scroll: false },
      ),
    );
  }
  return (
    <NavigationContext.Provider
      value={{
        pending,
        update,
        refresh: () => startTransition(() => router.refresh()),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}
function useModeratorNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Moderator navigation is required");
  return navigation;
}
export function ModeratorSearch({
  panel,
}: {
  panel: "inbox" | "directory" | "activity";
}) {
  const params = useSearchParams();
  const { update } = useModeratorNavigation();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== searchInput.current)
      setSearch(params.get("q") ?? "");
  }, [params]);
  useEffect(() => {
    const restore = () =>
      setSearch(new URLSearchParams(window.location.search).get("q") ?? "");
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        search !== (new URLSearchParams(window.location.search).get("q") ?? "")
      )
        update({ q: search || null, page: null, submission: null }, true);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <div className="moderator-search relative w-full sm:w-64">
      <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
      <Input
        ref={searchInput}
        value={search}
        maxLength={120}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={
          panel === "inbox"
            ? "Search reports"
            : panel === "directory"
              ? "Search directory"
              : "Search activity"
        }
        aria-label={
          panel === "inbox"
            ? "Search reports"
            : panel === "directory"
              ? "Search directory"
              : "Search activity"
        }
        className="bg-card pl-9"
      />
    </div>
  );
}
export function InboxFilters({ counts }: { counts: ModeratorInbox["counts"] }) {
  const params = useSearchParams();
  const location = moderatorLocation(new URLSearchParams(params));
  const { update } = useModeratorNavigation();
  return (
    <Tabs
      value={location.inbox.kind}
      onValueChange={(kind) =>
        update({
          kind: kind === "all" ? null : kind,
          page: null,
          submission: null,
        })
      }
      className="moderator-tabs min-w-0"
    >
      <TabsList className="moderator-tab-list">
        {(["all", "reports", "disputes", "feedback"] as const).map((kind) => (
          <TabsTrigger
            className="moderator-tab-trigger"
            value={kind}
            key={kind}
          >
            {kind === "all"
              ? "All"
              : kind === "feedback"
                ? "General feedback"
                : kind[0].toUpperCase() + kind.slice(1)}{" "}
            <span className="moderator-tab-count">{counts[kind] ?? 0}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
export function DirectoryControls() {
  const params = useSearchParams();
  const location = moderatorLocation(new URLSearchParams(params));
  const { update, pending } = useModeratorNavigation();
  return (
    <>
      <div className="moderator-resource-tabs">
        <Tabs
          className="moderator-tabs"
          value={location.directory.resource}
          onValueChange={(resource) =>
            update({
              resource,
              page: null,
              q: null,
              type: null,
              status: null,
              publication: null,
              sort: null,
              direction: null,
            })
          }
        >
          <TabsList className="moderator-tab-list">
            {["relationships", "channels", "firms"].map((resource) => (
              <TabsTrigger
                className="moderator-tab-trigger"
                key={resource}
                value={resource}
              >
                {resource[0].toUpperCase() + resource.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="moderator-toolbar">
        <ModeratorSearch panel="directory" />
        {location.directory.resource === "relationships" && (
          <div className="moderator-filters">
            <WorkspaceFilter
              label="Relationship"
              value={location.directory.type}
              options={["all", "funding", "acquisition"]}
              onChange={(type) =>
                update({ type: type === "all" ? null : type, page: null })
              }
            />
            <WorkspaceFilter
              label="Record status"
              value={location.directory.status}
              options={[
                "all",
                "confirmed",
                "provisional",
                "disputed",
                "rejected",
              ]}
              onChange={(status) =>
                update({
                  status: status === "all" ? null : status,
                  page: null,
                })
              }
            />
            <WorkspaceFilter
              label="Publication"
              value={location.directory.publication}
              options={["all", "published", "draft"]}
              onChange={(publication) =>
                update({
                  publication: publication === "all" ? null : publication,
                  page: null,
                })
              }
            />
            {(location.directory.type !== "all" ||
              location.directory.status !== "all" ||
              location.directory.publication !== "all" ||
              location.directory.q) && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  update({
                    type: null,
                    status: null,
                    publication: null,
                    q: null,
                    page: null,
                  })
                }
              >
                <X />
                Reset filters
              </Button>
            )}
          </div>
        )}
        <Button
          className="moderator-add"
          disabled={pending}
          onClick={() =>
            location.directory.resource === "relationships"
              ? update({ edit: "new", source: null })
              : update({
                  entity: location.directory.resource,
                  entityId: "new",
                })
          }
        >
          <Plus />
          Add{" "}
          {location.directory.resource === "relationships"
            ? "relationship"
            : location.directory.resource === "channels"
              ? "channel"
              : "firm"}
        </Button>
      </div>
    </>
  );
}
export function ModeratorSort({
  column,
  label,
  active,
  direction,
}: {
  column: string;
  label: string;
  active: boolean;
  direction: "asc" | "desc";
}) {
  const { update, pending } = useModeratorNavigation();
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
        (active
          ? direction === "asc"
            ? " descending"
            : " ascending"
          : " ascending")
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
export function ModeratorButton({
  changes,
  replace,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  changes: Changes;
  replace?: boolean;
}) {
  const { update, pending } = useModeratorNavigation();
  return (
    <Button
      {...props}
      disabled={props.disabled || pending}
      onClick={() => update(changes, replace)}
    >
      {children}
    </Button>
  );
}
export function ModeratorPager({
  inbox = false,
  ...props
}: {
  page: number;
  pageSize: number;
  total: number;
  inbox?: boolean;
}) {
  const { update, pending } = useModeratorNavigation();
  return (
    <Pager
      {...props}
      pending={pending}
      onPageSizeChange={(pageSize) =>
        update({
          pageSize: String(pageSize),
          page: null,
          ...(inbox ? { submission: null } : {}),
        })
      }
      onChange={(page) =>
        update({ page: String(page), ...(inbox ? { submission: null } : {}) })
      }
    />
  );
}
export function ReportDecisions({
  selected,
  inbox,
  page,
}: {
  selected: SubmissionContext;
  inbox: ModeratorInbox;
  page: number;
}) {
  const { update, pending, refresh } = useModeratorNavigation();
  const [busy, setBusy] = useState(false);
  const selectedId = selected.submission.id;
  const reviewReady =
    !pending &&
    selected.submission.status === "pending" &&
    inbox.items.some((item) => item.id === selectedId);
  async function decided(status: "approved" | "rejected") {
    const context = selected;
    if (!context || busy || !reviewReady) return;
    setBusy(true);
    try {
      await mutateModerator(
        "submissions/" + context.submission.id + "/decision",
        "POST",
        { status },
      );
      const rest =
        inbox?.items.filter((item) => item.id !== context.submission.id) ?? [];
      const patch: Record<string, string | null> = {
        submission: rest[0]?.id ?? null,
        ...(!rest.length && page > 1 ? { page: String(page - 1) } : {}),
      };
      if (
        status === "approved" &&
        context.submission.kind !== "feedback" &&
        context.submission.channelId
      ) {
        const explicit = context.submission.payload.claimId;
        const match = explicit
          ? context.relationships.find((r) => r.id === explicit)
          : context.relationships.length === 1
            ? context.relationships[0]
            : undefined;
        patch.edit =
          match?.id ?? (context.relationships.length ? "choose" : "new");
        patch.source = context.submission.id;
      }
      update(patch, true);
      toast.success(
        status === "approved" ? "Report approved." : "Report rejected.",
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Unable to save the decision.",
      );
      if (error instanceof ApiError && error.status === 409) {
        update({ submission: null }, true);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2 border-t pt-5">
      <Button
        disabled={busy || !reviewReady}
        onClick={() => decided("approved")}
      >
        {busy ? "Saving…" : "Approve report"}
      </Button>
      <Button
        variant="outline"
        disabled={busy || !reviewReady}
        onClick={() => decided("rejected")}
      >
        Reject report
      </Button>
    </div>
  );
}
export function ModeratorRetry({ message }: { message: string }) {
  const { refresh, pending } = useModeratorNavigation();
  return (
    <div className="p-5 text-sm">
      <p>{message}</p>
      <Button
        variant="outline"
        className="mt-3"
        disabled={pending}
        onClick={refresh}
      >
        Try again
      </Button>
    </div>
  );
}
export function EditorSheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { update } = useModeratorNavigation();
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Radix portals render only after hydration. Keep the streamed loading/error
  // frame visible in the initial HTML, then hand focus management to Radix.
  if (!mounted) {
    const query = new URLSearchParams(params);
    for (const key of ["edit", "source", "entity", "entityId"])
      query.delete(key);
    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/50" />
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-4 border-l bg-background shadow-lg sm:max-w-2xl"
        >
          <div className="flex flex-col gap-1.5 p-4">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Manage directory records.
            </p>
          </div>
          {children}
          <a
            className="absolute right-4 top-4 text-sm underline"
            href={"/moderator" + (query.size ? "?" + query : "")}
          >
            Close
          </a>
        </section>
      </>
    );
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open)
          update({ edit: null, source: null, entity: null, entityId: null });
      }}
    >
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Manage directory records.</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
export function RelationshipForm({
  record,
  context,
}: {
  record?: ModeratorRelationship;
  context?: SubmissionContext;
}) {
  const { update } = useModeratorNavigation();
  const close = () => update({ edit: null, source: null });
  return (
    <RelationshipEditor
      record={record}
      submission={context?.submission}
      channels={
        context?.channel ? [context.channel] : record ? [record.channel] : []
      }
      firms={record?.firm ? [record.firm] : []}
      onClose={close}
      onSaved={close}
    />
  );
}
export function EntityForm({
  kind,
  record,
}: {
  kind: "channels" | "firms";
  record?: ModeratorChannel | ModeratorFirm;
}) {
  const { update } = useModeratorNavigation();
  const close = () => update({ entity: null, entityId: null });
  return (
    <EntityEditor kind={kind} record={record} onClose={close} onSaved={close} />
  );
}
function WorkspaceFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-auto min-w-32 bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem value={option} key={option}>
            {option === "all"
              ? label === "Relationship"
                ? "All relationships"
                : label === "Record status"
                  ? "All statuses"
                  : "Published & drafts"
              : option[0].toUpperCase() + option.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Pager({
  page,
  pageSize,
  total,
  pending,
  onChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  pending: boolean;
  onChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span role="status">
        {pending ? (
          "Loading…"
        ) : (
          <>
            {total} record{total === 1 ? "" : "s"} · Page {page} of {pages}
          </>
        )}
      </span>
      <div className="flex items-center gap-3">
        <Select
          value={String(pageSize)}
          disabled={pending}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="h-8 w-auto gap-2 text-xs"
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
                disabled={page <= 1 || pending}
                onClick={() => onChange(page - 1)}
              >
                <ChevronLeft />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next page"
                disabled={page >= pages || pending}
                onClick={() => onChange(page + 1)}
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
