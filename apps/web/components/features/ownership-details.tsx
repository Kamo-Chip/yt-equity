"use client";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { OwnershipGraph } from "@yt-equity/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OwnershipEvidence } from "@/components/features/ownership-evidence";
type Entity = OwnershipGraph["nodes"][number];
function EntityAvatar({ entity }: { entity?: Entity }) {
  return (
    <Avatar className="size-12 rounded-2xl border bg-background shadow-sm">
      <AvatarImage
        src={
          entity?.kind === "firm"
            ? entity.profilePictureUrl
            : entity?.profilePictureUrl
        }
        alt=""
        style={entity?.kind === "firm" ? { background: entity.profilePictureBackground } : undefined}
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
      ? identity.undisclosed ? null : "/firms/" + identity.id.replace("firm:", "")
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
            <h2 className="break-words text-xl font-semibold leading-tight tracking-tight">
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
              identity?.kind === "channel"
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
                            ? connected.profilePictureUrl
                            : connected?.profilePictureUrl
                        }
                        style={connected?.kind === "firm" ? { background: connected.profilePictureBackground } : undefined}
                        alt=""
                      />
                      <AvatarFallback className="text-xs">
                        {connected?.name[0] ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <h4 className="text-sm font-semibold leading-snug">
                      {identity?.kind === "firm" ? (
                        <>{record.type === "funding" ? "Funded" : "Acquired"} {connected?.name ?? "channel"}</>
                      ) : (
                        <>{record.type === "funding" ? "Funded by" : "Acquired by"} {connected?.name ?? "an undisclosed firm"}</>
                      )}
                    </h4>
                  </div>
                  <OwnershipEvidence record={record} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
