import type { Metadata } from "next";
import { publicMetadata, privateRobots } from "@/lib/metadata";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPublicChannel } from "@/lib/public-data";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OwnershipEvidence } from "@/components/features/ownership-evidence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
export async function generateMetadata({ params }: {
  params: Promise<{ channelId: string }>;
}): Promise<Metadata> {
  const { channelId } = await params;
  const entity = await getPublicChannel(channelId);
  if (!entity) return { title: "Channel not found", robots: privateRobots };
  return publicMetadata(
    entity.name,
    `Research ${entity.name}’s ownership and funding.`,
    `/channels/${encodeURIComponent(entity.channelId)}`,
  );
}

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
      <div className="profile-identity mb-6 flex items-center gap-4">
        <Avatar className="size-16 border">
          <AvatarImage src={channel?.profilePictureUrl} alt="" className="object-cover" />
          <AvatarFallback className="text-xl font-semibold">{(channel?.name ?? identifier)[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
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
        </CardHeader>
        <CardContent>
          {channel?.claims.length ? (
            <div className="divide-y">
              {channel.claims.map((claim) => (
                <article className="py-5 first:pt-0 last:pb-0" key={claim.id}>
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
                  <OwnershipEvidence record={claim} />
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
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
          <Link
            href={`/report/channel?${new URLSearchParams({ channelId: channel?.channelId ?? identifier, contribution: "report" })}`}
          >
            Report channel
          </Link>
        </Button>
        {channel && (
          <>
            <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
              <Link
                href={`/report/channel?${new URLSearchParams({ channelId: channel.channelId, contribution: "correction" })}`}
              >
                Suggest an update
              </Link>
            </Button>
            <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
              <Link
                href={`/report/channel?${new URLSearchParams({ channelId: channel.channelId, contribution: "dispute" })}`}
              >
                Dispute record
              </Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
