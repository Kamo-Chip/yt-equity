import "server-only";
import { ApiError } from "@/lib/api";
import { Suspense } from "react";
import type {
  ModeratorInbox,
  ModeratorDirectory,
  ModeratorRelationshipSummary,
} from "@yt-equity/contracts";
import { moderatorLocation } from "@/lib/moderator-query";
import {
  moderatorRead,
  getModeratorContext,
  getModeratorSection,
  localRead,
} from "@/lib/moderator-data";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, Inbox, Plus, ArrowRight } from "lucide-react";
import {
  ModeratorNavigation,
  ModeratorSearch,
  InboxFilters,
  DirectoryControls,
  ModeratorButton,
  ModeratorPager,
  ModeratorSort,
  ReportDecisions,
  ModeratorRetry,
  EditorSheet,
  RelationshipForm,
  EntityForm,
} from "./moderator-controls";
import {
  ModeratorQueueSkeleton,
  ModeratorDetailSkeleton,
  ModeratorTableSkeleton,
  ModeratorEditorSkeleton,
} from "./loading-states";
import type { Activity } from "@/lib/moderator-query";
import type {
  ModeratorRelationship,
  ModeratorChannel,
  ModeratorFirm,
} from "@yt-equity/contracts";
type Location = ReturnType<typeof moderatorLocation>;
export type ModeratorSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;
export async function ModeratorWorkspace({
  searchParams,
}: {
  searchParams: ModeratorSearchParams;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams(
    Object.entries(raw).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
  const location = moderatorLocation(params);
  const { panel } = location;
  const sectionKey = JSON.stringify(location.key);
  return (
    <ModeratorNavigation>
      <main className="workspace-page moderator-page">
        <div className="moderator-page-header">
          <div>
            <h1 className="workspace-heading">
              {panel === "inbox"
                ? "Review inbox"
                : panel === "directory"
                  ? "Directory"
                  : "Activity"}
            </h1>
          </div>
        </div>
        {panel === "inbox" ? (
          <Suspense key={sectionKey} fallback={<ModeratorQueueSkeleton />}>
            <InboxSection
              location={location}
              selectedId={params.get("submission")}
            />
          </Suspense>
        ) : panel === "directory" ? (
          <>
            <DirectoryControls />
            <Suspense
              key={sectionKey}
              fallback={<ModeratorTableSkeleton label="Loading directory" />}
            >
              <DirectorySection location={location} />
            </Suspense>
          </>
        ) : (
          <>
            <div className="moderator-toolbar">
              <ModeratorSearch panel="activity" />
            </div>
            <Suspense
              key={sectionKey}
              fallback={<ModeratorTableSkeleton label="Loading activity" />}
            >
              <ActivitySection location={location} />
            </Suspense>
          </>
        )}
        {(params.get("edit") ||
          (params.get("entity") && params.get("entityId"))) && (
          <Suspense
            key={[
              params.get("edit"),
              params.get("source"),
              params.get("entity"),
              params.get("entityId"),
            ].join(":")}
            fallback={
              <EditorSheet title="Loading record">
                <ModeratorEditorSkeleton />
              </EditorSheet>
            }
          >
            <EditorSection params={params} location={location} />
          </Suspense>
        )}
      </main>
    </ModeratorNavigation>
  );
}
async function InboxSection({
  location,
  selectedId: requested,
}: {
  location: Location;
  selectedId: string | null;
}) {
  const inbox = await getModeratorSection<ModeratorInbox>(location.endpoint);
  const selectedId = requested ?? inbox.items[0]?.id;
  return (
    <>
      <div className="moderator-toolbar moderator-inbox-toolbar">
        <InboxFilters counts={inbox.counts} />
        <ModeratorSearch panel="inbox" />
      </div>
      <Card className="moderator-card workspace-layout min-w-0 gap-0 overflow-hidden py-0 shadow-none">
        <div className="min-w-0 p-2">
          {inbox.items.length ? (
            inbox.items.map((item) => (
              <ModeratorButton
                variant={item.id === selectedId ? "secondary" : "ghost"}
                aria-current={item.id === selectedId ? "true" : undefined}
                key={item.id}
                changes={{ submission: item.id }}
                className="mb-1 h-auto w-full flex-col items-start gap-1.5 rounded-md whitespace-normal border border-transparent p-3 text-left aria-[current=true]:border-border"
              >
                <span className="line-clamp-2 text-sm font-semibold">
                  {item.kind === "feedback"
                    ? "General feedback"
                    : (item.channelId ?? "Ownership report")}
                </span>
                <span className="line-clamp-2 text-xs font-normal leading-5 text-muted-foreground">
                  {item.payload.explanation}
                </span>
                <span className="flex gap-2 text-[11px] text-muted-foreground">
                  <span className="capitalize">
                    {item.kind.replace("_", " ")}
                  </span>
                  <span>
                    ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}
                  </span>
                </span>
              </ModeratorButton>
            ))
          ) : (
            <div className="grid justify-items-center gap-3 p-8 text-center text-sm text-muted-foreground">
              <Inbox />
              <p>No pending reports.</p>
            </div>
          )}
          <ModeratorPager
            page={inbox.page}
            pageSize={inbox.pageSize}
            total={inbox.total}
            inbox
          />
        </div>
        <section className="workspace-detail min-w-0">
          <Suspense
            key={selectedId ?? "empty"}
            fallback={<ModeratorDetailSkeleton />}
          >
            {selectedId ? (
              <ReportDetail id={selectedId} inbox={inbox} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a report to review.
              </p>
            )}
          </Suspense>
        </section>
      </Card>
    </>
  );
}
async function ReportDetail({
  id,
  inbox,
}: {
  id: string;
  inbox: ModeratorInbox;
}) {
  const selected = await localRead(() => getModeratorContext(id));
  if (!selected) return <ModeratorRetry message="Couldn’t load this report." />;
  const report = selected.submission;
  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          {report.kind !== "feedback" && (
            <p className="mb-2 text-xs capitalize text-muted-foreground">
              {report.kind.replace("_", " ")}
            </p>
          )}
          <h2 className="text-xl font-semibold tracking-tight">
            {selected.channel?.name ?? report.channelId ?? "General feedback"}
          </h2>
        </div>
      </div>
      <p className="mb-5 whitespace-pre-wrap text-sm leading-6">
        {report.payload.explanation}
      </p>
      {report.contactEmail && (
        <p className="mb-6 break-all text-xs text-muted-foreground">
          {report.contactEmail}
        </p>
      )}
      {report.kind !== "feedback" && (
        <>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence submitted
          </h3>
          <div className="mb-6 grid gap-2">
            {report.payload.sources?.map((url) => (
              <a
                className="source-link flex items-center justify-between gap-2 rounded-lg border p-3 text-sm text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={url}
                target="_blank"
                rel="noreferrer"
                key={url}
              >
                <span className="truncate">{url}</span>
                <ArrowUpRight className="size-3.5 shrink-0" />
              </a>
            ))}
          </div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Existing records
          </h3>
          <div className="mb-6 grid gap-2">
            {selected.relationships.length ? (
              selected.relationships.map((r) => (
                <Card key={r.id} className="gap-0 py-0 shadow-none">
                  <CardContent className="p-3">
                    <p className="mb-2 text-sm font-medium">
                      {r.type === "funding" ? "Funded by" : "Acquired by"}{" "}
                      {r.firm?.name ?? "an undisclosed firm"}
                    </p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="capitalize">
                        {r.status}
                      </Badge>
                      <Badge variant="secondary">
                        {r.published ? "Published" : "Draft"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No relationships recorded.
              </p>
            )}
          </div>
        </>
      )}
      {report.status !== "pending" ? (
        <p role="status" className="text-sm text-muted-foreground">
          This report has already been reviewed.
        </p>
      ) : (
        <ReportDecisions selected={selected} inbox={inbox} page={inbox.page} />
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Review decisions do not publish directory changes.
      </p>
    </>
  );
}
async function DirectorySection({ location }: { location: Location }) {
  const directory = await getModeratorSection<ModeratorDirectory>(
    location.endpoint,
  );
  const sort =
    location.directory.sort ??
    (directory.resource === "relationships" ? undefined : "name");
  const direction = location.directory.direction ?? "asc";
  const columns = directory.resource === "relationships" ? 4 : 3;
  function header(column: string, label: string) {
    return (
      <TableHead
        aria-label={label}
        aria-sort={
          sort === column
            ? direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <ModeratorSort
          column={column}
          label={label}
          active={sort === column}
          direction={direction}
        />
      </TableHead>
    );
  }
  return (
    <Card className="moderator-card moderator-table min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <Table
        className={
          directory.resource === "relationships"
            ? "moderator-directory-relationships"
            : "moderator-directory-entities"
        }
        aria-label={
          directory.resource[0].toUpperCase() +
          directory.resource.slice(1) +
          " directory"
        }
      >
        <TableHeader className="bg-muted/50">
          <TableRow>
            {header(
              "name",
              directory.resource === "relationships" ? "Channel" : "Name",
            )}
            {header("details", "Details")}
            {directory.resource === "relationships" &&
              header("status", "Status")}
            <TableHead className="w-20 text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {directory.items.map((item) => {
            const relationship =
              "channel" in item
                ? (item as ModeratorRelationshipSummary)
                : undefined;
            return (
              <TableRow key={item.id}>
                <TableCell className="py-4 font-medium">
                  {relationship
                    ? relationship.channel.name
                    : "name" in item
                      ? item.name
                      : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {relationship
                    ? `${relationship.type === "funding" ? "Funded by" : "Acquired by"} ${relationship.firm?.name ?? "an undisclosed firm"}`
                    : "channelId" in item
                      ? (item.handle ?? item.channelId)
                      : "website" in item
                        ? (item.website ?? "—")
                        : "—"}
                </TableCell>
                {directory.resource === "relationships" && (
                  <TableCell>
                    <div className="moderator-record-status">
                      <Badge
                        variant="outline"
                        className="moderator-publication"
                      >
                        {relationship?.published ? "Published" : "Draft"}
                      </Badge>
                      <span className="sr-only"> · </span>
                      <span className="moderator-status-label capitalize">
                        <span
                          aria-hidden="true"
                          className={
                            "moderator-status-dot status-" +
                            relationship?.status
                          }
                        />
                        {relationship?.status}
                      </span>
                    </div>
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <ModeratorButton
                    size="sm"
                    variant="outline"
                    changes={
                      relationship
                        ? { edit: relationship.id, source: null }
                        : { entity: directory.resource, entityId: item.id }
                    }
                  >
                    Edit
                  </ModeratorButton>
                </TableCell>
              </TableRow>
            );
          })}
          {!directory.items.length && (
            <TableRow>
              <TableCell
                colSpan={columns}
                className="h-40 text-center text-muted-foreground"
              >
                No matching records.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <ModeratorPager
        page={directory.page}
        pageSize={directory.pageSize}
        total={directory.total}
      />
    </Card>
  );
}
async function ActivitySection({ location }: { location: Location }) {
  const recent = await getModeratorSection<Activity[]>(location.endpoint);
  const { q, sort, direction } = location.activity;
  const items = recent
    .filter((item) =>
      `${item.action} ${item.entityType} ${item.entityType === "submission" ? "Report" : humanize(item.entityType)}`
        .toLowerCase()
        .includes(q.toLowerCase()),
    )
    .sort((a, b) => {
      const field = sort as "action" | "entityType" | "createdAt";
      const comparison =
        field === "createdAt"
          ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
          : a[field].localeCompare(b[field]);
      return (
        (direction === "asc" ? comparison : -comparison) ||
        a.id.localeCompare(b.id)
      );
    });
  return (
    <Card className="moderator-card moderator-table min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <Table
        className="moderator-activity-table"
        aria-label="Workspace activity"
      >
        <TableHeader className="bg-muted/50">
          <TableRow>
            {(
              [
                ["action", "Action"],
                ["entityType", "Record"],
                ["createdAt", "Time"],
              ] as const
            ).map(([column, label]) => (
              <TableHead
                aria-label={label}
                key={column}
                aria-sort={
                  sort === column
                    ? direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <ModeratorSort
                  column={column}
                  label={label}
                  active={sort === column}
                  direction={direction}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="py-4">
                <span className={"moderator-action action-" + item.action}>
                  <span aria-hidden="true" className="moderator-action-dot" />
                  {humanize(item.action)}
                </span>
              </TableCell>
              <TableCell>
                {item.entityType === "submission"
                  ? "Report"
                  : humanize(item.entityType)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatActivityTime(item.createdAt)}
              </TableCell>
            </TableRow>
          ))}
          {!items.length && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="h-40 text-center text-muted-foreground"
              >
                {q ? "No matching activity." : "No activity recorded yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div
        className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground"
        role="status"
      >
        <span>
          {items.length} event{items.length === 1 ? "" : "s"}
        </span>
        <span>Latest 200 events</span>
      </div>
    </Card>
  );
}

async function EditorSection({
  params,
  location,
}: {
  params: URLSearchParams;
  location: Location;
}) {
  const editor = params.get("edit"),
    source = params.get("source");
  if (editor) {
    const loaded = await localRead(async () => {
      const [context, record] = await Promise.all([
        source ? getModeratorContext(source) : undefined,
        !["new", "choose"].includes(editor)
          ? moderatorRead<ModeratorRelationship>(
              "relationships/" + encodeURIComponent(editor),
            )
          : undefined,
      ]);
      return { context, record };
    });
    if (!loaded)
      return (
        <EditorSheet title="Couldn’t load this record">
          <ModeratorRetry message="Your directory has not been changed." />
        </EditorSheet>
      );
    if (editor === "choose")
      return (
        <EditorSheet title="Choose a relationship">
          <div className="grid gap-3 p-5">
            {loaded.context?.relationships.map((r) => (
              <ModeratorButton
                key={r.id}
                variant="outline"
                className="h-auto justify-between whitespace-normal p-4 text-left"
                changes={{ edit: r.id }}
              >
                {r.type === "funding" ? "Funding from" : "Acquisition by"}{" "}
                {r.firm?.name ?? "an undisclosed firm"}
                <ArrowRight />
              </ModeratorButton>
            ))}
            <ModeratorButton variant="secondary" changes={{ edit: "new" }}>
              <Plus />
              Create relationship
            </ModeratorButton>
          </div>
        </EditorSheet>
      );
    return <RelationshipForm record={loaded.record} context={loaded.context} />;
  }
  const kind = params.get("entity"),
    id = params.get("entityId");
  if ((kind !== "channels" && kind !== "firms") || !id) return null;
  const result = await localRead(async () => {
    if (id === "new") return {};
    const directory = await getModeratorSection<ModeratorDirectory>(
      location.endpoint,
    );
    const record = directory.items.find((item) => item.id === id) as
      ModeratorChannel | ModeratorFirm | undefined;
    if (!record || directory.resource !== kind)
      throw new ApiError(404, "Record unavailable");
    return { record };
  });
  if (!result)
    return (
      <EditorSheet title="Couldn’t load this record">
        <ModeratorRetry message="Your directory has not been changed." />
      </EditorSheet>
    );
  return <EntityForm kind={kind} record={result.record} />;
}

function humanize(value: string) {
  const label = value.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function formatActivityTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Africa/Johannesburg",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month").replace("Sept", "Sep")} ${part("year")}, ${part("hour")}:${part("minute")}`;
}
