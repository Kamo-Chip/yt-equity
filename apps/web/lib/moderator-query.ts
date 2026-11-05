import {
  moderatorDirectoryQuerySchema,
  moderatorInboxQuerySchema,
} from "@yt-equity/contracts";
export type Activity = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
};
export function moderatorLocation(params: URLSearchParams) {
  const requested = params.get("panel") ?? "inbox";
  const panel = requested === "directory" || requested === "activity" ? requested : "inbox";
  const common = {
    q: params.get("q") ?? "",
    page: params.get("page") ?? 1,
    pageSize: params.get("pageSize") ?? 25,
  };
  const inboxParsed = moderatorInboxQuerySchema.safeParse({
    ...common,
    kind: params.get("kind") ?? "all",
  });
  const directoryParsed = moderatorDirectoryQuerySchema.safeParse({
    ...common,
    resource:
      params.get("resource") ?? "relationships",
    sort: params.get("sort") ?? undefined,
    direction: params.get("direction") ?? undefined,
    type: params.get("type") ?? "all",
    status: params.get("status") ?? "all",
    publication: params.get("publication") ?? "all",
  });
  const inbox = inboxParsed.success
    ? inboxParsed.data
    : moderatorInboxQuerySchema.parse({});
  const directory = directoryParsed.success
    ? directoryParsed.data
    : moderatorDirectoryQuerySchema.parse({});
  const activity = {
    q: (params.get("q") ?? "").slice(0, 120),
    sort: ["action", "entityType"].includes(params.get("sort") ?? "")
      ? params.get("sort")!
      : "createdAt",
    direction:
      params.get("direction") === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const key =
    panel === "inbox"
      ? ["moderator", "inbox", inbox]
      : panel === "directory"
        ? ["moderator", "directory", directory]
        : ["moderator", "activity", activity];
  const endpoint =
    panel === "activity"
      ? "audit-events"
      : panel +
        "?" +
        new URLSearchParams(
          Object.entries(panel === "inbox" ? inbox : directory)
            .filter(([, value]) => value !== undefined)
            .map(([k, v]) => [k, String(v)]),
        ).toString();
  return { panel, inbox, directory, activity, key, endpoint };
}
