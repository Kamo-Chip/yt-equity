import type { Metadata } from "next";
import { publicMetadata, privateRobots } from "@/lib/metadata";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getPublicFirm } from "@/lib/public-data";
import { Button } from "@/components/ui/button";
import { OwnershipEvidence } from "@/components/features/ownership-evidence";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export async function generateMetadata({ params }: {
  params: Promise<{ firmId: string }>;
}): Promise<Metadata> {
  const { firmId } = await params;
  const entity = await getPublicFirm(firmId);
  if (!entity) return { title: "Firm not found", robots: privateRobots };
  return publicMetadata(
    entity.name,
    `Research ${entity.name}’s YouTube channel investments and ownership records.`,
    `/firms/${encodeURIComponent(entity.id)}`,
  );
}

export default async function FirmPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;
  const firm = await getPublicFirm(firmId);
  if (!firm) notFound();
  return (
    <main className="container page page-narrow">
      <Button asChild size="sm" variant="ghost" className="mb-6 -ml-3">
        <Link href={"/?q=" + encodeURIComponent(firm.name)}>
          <ArrowLeft />
          Ownership graph
        </Link>
      </Button>
      <div className="profile-identity mb-8 flex items-center gap-4">
        <Avatar className="size-16 border">
          <AvatarImage src={firm.profilePictureUrl} alt="" style={{ background: firm.profilePictureBackground }} className="object-contain p-2" />
          <AvatarFallback className="text-xl font-semibold">{firm.name[0]}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Investment firm</p>
          <h1 className="!mb-2">{firm.name}</h1>
          {firm.website && (
            <a
              className="inline-flex items-center gap-1 text-sm text-blue-700 dark:text-blue-400 hover:underline"
              href={firm.website}
              target="_blank"
              rel="noreferrer"
            >
              Website
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </div>
      </div>
      <h2 className="mb-4">Channel records</h2>
      <div className="grid gap-4">
        {firm.claims.length ? (
          firm.claims.map((claim) => (
            <Card key={claim.id} className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  {claim.type === "funding" ? "Funded" : "Acquired"}{" "}
                  <Link
                    href={"/channels/" + claim.channel.channelId}
                    className="hover:underline"
                  >
                    {claim.channel.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OwnershipEvidence record={claim} />
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="shadow-none">
            <CardContent className="text-sm text-muted-foreground">
              No published channel records.
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
