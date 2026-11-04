import { Suspense } from "react";
import Link from "next/link";
import { ContributionForm } from "@/components/features/contribution-form";

export const metadata = { title: "Report a channel — YT Equity" };
type Query = { channelId?: string; contribution?: string; claimId?: string };
async function ReportContent({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const mode =
    query.contribution === "dispute" || query.contribution === "correction"
      ? query.contribution
      : "report";
  return (
    <ContributionForm
      key={JSON.stringify(query)}
      channelId={typeof query.channelId === "string" ? query.channelId : ""}
      mode={mode}
      claimId={typeof query.claimId === "string" ? query.claimId : undefined}
    />
  );
}
export default function ChannelReportPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  return (
    <main className="container page page-narrow">
      <h1 className="page-heading">Report a channel</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Share ownership or funding information, suggest a correction, or dispute
        a record. Submissions are reviewed privately before any directory
        changes are published. No sign-in is required.
      </p>
      <Suspense fallback={<p role="status">Loading report form…</p>}>
        <ReportContent searchParams={searchParams} />
      </Suspense>
      <p className="mt-6 text-sm text-muted-foreground">
        Having trouble with the website or extension?{" "}
        <Link className="underline" href="/report">
          Report an issue
        </Link>
        .
      </p>
    </main>
  );
}
