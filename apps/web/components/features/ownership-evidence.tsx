import { ArrowUpRight } from "lucide-react";
import type { OwnershipGraph } from "@yt-equity/contracts";

type RecordEvidence = Pick<
  OwnershipGraph["edges"][number],
  "confidence" | "announcedAt" | "sources"
>;

export function OwnershipEvidence({ record }: { record: RecordEvidence }) {
  const first = record.sources[0];
  return (
    <div className="mt-3 grid gap-3 text-sm">
      {record.announcedAt && (
        <p className="text-xs text-muted-foreground">
          Announced {new Date(record.announcedAt).toLocaleDateString("en-ZA", {
            timeZone: "Africa/Johannesburg",
          })}
        </p>
      )}
      {first ? (
        <EvidenceLink source={first} />
      ) : (
        <p className="text-xs text-muted-foreground">No source links recorded.</p>
      )}
      <details>
        <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Details
        </summary>
        <div className="mt-3 grid gap-3 border-l pl-3">
          <p className="text-xs text-muted-foreground">
            {record.confidence}% confidence
          </p>
          {first && (
            <p className="text-xs text-muted-foreground">
              Source quality: {first.tier}
            </p>
          )}
          {record.sources.length > 1 && (
            <ul className="grid gap-3">
              {record.sources.slice(1).map((source, index) => (
                <li key={source.url + index}>
                  <EvidenceLink source={source} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source quality: {source.tier}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function EvidenceLink({ source }: { source: RecordEvidence["sources"][number] }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-start gap-1 text-sm text-blue-700 hover:underline dark:text-blue-400"
    >
      <span className="min-w-0 break-words">
        {source.title ?? source.publisher ?? source.url}
      </span>
      <ArrowUpRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
    </a>
  );
}
