import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getPublicFirm } from "@/lib/public-data";
import { firmLogo } from "@/components/features/firm-logos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
      <div className="mb-8 flex items-center gap-4">
        <img
          src={firmLogo(firm.name)}
          alt=""
          className="size-16 rounded-full border object-contain p-2"
        />
        <div>
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
      <h2 className="mb-4">Published channel records</h2>
      <div className="grid gap-4">
        {firm.claims.length ? (
          firm.claims.map((claim) => (
            <Card key={claim.id} className="shadow-none">
              <CardHeader>
                <CardTitle className="text-base">
                  <Link
                    href={"/channels/" + claim.channel.channelId}
                    className="hover:underline"
                  >
                    {claim.channel.name}
                  </Link>
                </CardTitle>
                <div className="flex gap-2 pt-1">
                  <Badge variant="secondary">
                    {claim.type === "acquisition" ? "Acquisition" : "Funding"}
                  </Badge>
                  <Badge variant="outline">{claim.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-muted-foreground">
                  {claim.confidence}% confidence
                </p>
                <ul className="grid gap-2">
                  {claim.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words text-sm text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {source.title ?? source.publisher ?? source.url} ↗
                      </a>
                    </li>
                  ))}
                </ul>
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
