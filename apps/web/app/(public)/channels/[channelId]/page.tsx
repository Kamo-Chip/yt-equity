import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPublicChannel } from "@/lib/public-data";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ contribution?: string; claimId?: string }>;
}) {
  const { channelId } = await params;
  const identifier = decodeURIComponent(channelId);
  const query = await searchParams;
  if (["report", "correction", "dispute"].includes(query.contribution ?? "")) {
    const target = new URLSearchParams({
      channelId: identifier,
      contribution: query.contribution!,
    });
    if (typeof query.claimId === "string") target.set("claimId", query.claimId);
    redirect(`/report/channel?${target}`);
  }
  const channel = await getPublicChannel(identifier);
  return (
    <main className="container page page-narrow">
      <Button asChild size="sm" variant="ghost" className="mb-6 -ml-3">
        <Link href={"/?q=" + encodeURIComponent(channel?.name ?? identifier)}>
          <ArrowLeft />
          Ownership graph
        </Link>
      </Button>
      <div className="mb-6 flex items-center gap-4">
        {channel?.profilePictureUrl && (
          <img
            className="size-16 rounded-full object-cover"
            src={channel.profilePictureUrl}
            alt=""
          />
        )}
        <div>
          <p className="text-xs text-muted-foreground">YouTube channel</p>
          <h1 className="!mb-1">{channel?.name ?? identifier}</h1>
          <p className="text-sm text-muted-foreground">
            {channel?.handle ?? identifier}
          </p>
          {channel?.easterEgg && (
            <p className="mt-2 text-sm font-medium">
              <span aria-hidden="true">{channel.easterEgg.emoji}</span>{" "}
              {channel.easterEgg.message}
            </p>
          )}
        </div>
      </div>
      <Card className="mb-6 shadow-none">
        <CardHeader>
          <CardTitle>Ownership records</CardTitle>
          <CardDescription>
            Published relationships and supporting evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {channel?.claims.length ? (
            <div className="divide-y">
              {channel.claims.map((claim) => (
                <article className="py-5 first:pt-0 last:pb-0" key={claim.id}>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      {claim.type === "funding" ? "Funding" : "Acquisition"}
                    </Badge>
                    <Badge variant="outline">{claim.status}</Badge>
                  </div>
                  <h2 className="!text-base">
                    {claim.type === "funding" ? "Funded by" : "Acquired by"}{" "}
                    {claim.firm ? (
                      <Link
                        className="hover:underline"
                        href={"/firms/" + claim.firm.id}
                      >
                        {claim.firm.name}
                      </Link>
                    ) : (
                      "an undisclosed firm"
                    )}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {claim.confidence}% confidence
                    {claim.announcedAt
                      ? " · Announced " +
                        new Date(claim.announcedAt).toLocaleDateString(
                          "en-ZA",
                          { timeZone: "Africa/Johannesburg" },
                        )
                      : ""}
                  </p>
                  <ul className="mt-4 grid gap-2">
                    {claim.sources.map((source) => (
                      <li key={source.url} className="text-sm">
                        <a
                          className="break-words text-blue-700 dark:text-blue-400 hover:underline"
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.title ?? source.publisher ?? source.url} ↗
                        </a>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {source.tier}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No published ownership record.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link
            href={`/report/channel?${new URLSearchParams({ channelId: channel?.channelId ?? identifier, contribution: "report" })}`}
          >
            Report this channel
          </Link>
        </Button>
        {channel && (
          <>
            <Button asChild variant="outline">
              <Link
                href={`/report/channel?${new URLSearchParams({ channelId: channel.channelId, contribution: "correction" })}`}
              >
                Suggest an update
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/report/channel?${new URLSearchParams({ channelId: channel.channelId, contribution: "dispute" })}`}
              >
                Dispute this ownership record
              </Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
