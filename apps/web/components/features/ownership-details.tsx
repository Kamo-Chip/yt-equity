"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, X, FileText } from "lucide-react";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { firmLogo } from "./firm-logos";
type Entity = OwnershipGraph["nodes"][number];
function EntityAvatar({ entity }: { entity?: Entity }) {
  return (
    <Avatar className="size-12 rounded-2xl border bg-background shadow-sm">
      <AvatarImage
        src={
          entity?.kind === "firm"
            ? firmLogo(entity.name)
            : entity?.profilePictureUrl
        }
        alt=""
        className={
          entity?.kind === "firm" ? "object-contain p-2" : "object-cover"
        }
      />
      <AvatarFallback className="rounded-2xl">
        {entity?.name[0] ?? "Y"}
      </AvatarFallback>
    </Avatar>
  );
}
export function OwnershipDetails({
  graph,
  selection,
  onClose,
}: {
  graph: OwnershipGraph;
  selection: { kind: "node" | "edge"; id: string };
  onClose: () => void;
}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const entity = selection.kind === "node" ? byId.get(selection.id) : undefined;
  const records = graph.edges.filter((e) =>
    selection.kind === "edge"
      ? e.id === selection.id
      : e.source === selection.id || e.target === selection.id,
  );
  const identity = entity ?? byId.get(records[0]?.target);
  const title = identity?.name ?? "Relationship";
  const website = entity?.kind === "firm" ? entity.website : undefined;
  const profile =
    identity?.kind === "firm"
      ? "/firms/" + identity.id.replace("firm:", "")
      : identity?.kind === "channel"
        ? "/channels/" + encodeURIComponent(identity.channelId)
        : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="drawer-identity shrink-0 p-5">
        <div className="flex items-start gap-3">
          <EntityAvatar entity={identity} />
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {entity?.kind === "firm"
                ? "Investment firm"
                : entity?.kind === "channel"
                  ? "YouTube channel"
                  : "Ownership relationship"}
            </p>
            <h2 className="text-xl font-semibold leading-tight tracking-tight">
              {title}
            </h2>
            {identity?.kind === "channel" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {identity.handle ?? identity.channelId}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close details"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          {profile && (
            <Button size="sm" variant="outline" asChild>
              <Link href={profile}>
                View profile
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          {website && (
            <Button size="sm" variant="ghost" asChild>
              <a href={website} target="_blank" rel="noreferrer">
                Website
                <ArrowUpRight />
              </a>
            </Button>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground">
            Relationships
          </h3>
          <Badge variant="secondary" className="tabular-nums">
            {records.length}
          </Badge>
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-4 pt-0">
          {records.map((record) => {
            const connected =
              entity?.kind === "channel"
                ? byId.get(record.source)
                : byId.get(record.target);
            return (
              <Card
                key={record.id}
                className="relationship-card gap-0 py-0 shadow-none"
              >
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2.5">
                    <Avatar className="size-8">
                      <AvatarImage
                        src={
                          connected?.kind === "firm"
                            ? firmLogo(connected.name)
                            : connected?.profilePictureUrl
                        }
                        alt=""
                      />
                      <AvatarFallback className="text-xs">
                        {connected?.name[0] ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-semibold leading-snug">
                      {connected?.name ?? "Relationship"}
                    </p>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge
                      variant="secondary"
                      className={
                        record.type === "acquisition"
                          ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                          : ""
                      }
                    >
                      {record.type === "funding" ? "Funding" : "Acquisition"}
                    </Badge>
                    <Badge variant="outline" className="font-normal capitalize">
                      {record.status}
                    </Badge>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{record.confidence}% confidence</span>
                    {record.announcedAt && (
                      <span>
                        {new Date(record.announcedAt).toLocaleDateString(
                          "en-ZA",
                          { timeZone: "Africa/Johannesburg" },
                        )}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 border-t pt-3">
                    {record.sources.slice(0, 2).map((source, i) => (
                      <SourceLink key={i} source={source} />
                    ))}
                    {record.sources.length > 2 && (
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-0 text-xs text-muted-foreground"
                          >
                            {record.sources.length - 2} more sources
                            <ChevronDown />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="grid gap-2 pt-2">
                          {record.sources.slice(2).map((source, i) => (
                            <SourceLink key={i} source={source} />
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {!record.sources.length && (
                      <p className="text-xs text-muted-foreground">
                        No source links recorded.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
function SourceLink({
  source,
}: {
  source: OwnershipGraph["edges"][number]["sources"][number];
}) {
  let domain = source.publisher ?? "Source";
  try {
    domain = new URL(source.url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="source-link flex items-start gap-2 rounded-md p-1.5 -mx-1.5"
    >
      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs font-medium leading-5">
          {source.title ?? domain}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {source.title && source.title !== domain ? domain + " · " : ""}
          {source.tier}
        </span>
      </span>
      <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
    </a>
  );
}
