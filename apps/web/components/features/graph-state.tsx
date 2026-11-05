import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import type { ReactNode } from "react";

type GraphStateKind = "empty" | "no-matches" | "error";

export function GraphState({ kind, children }: { kind: GraphStateKind; children?: ReactNode }) {
  const title = {
    empty: "No ownership records yet",
    "no-matches": "No matching relationships",
    error: "Couldn’t load ownership records",
  }[kind];
  const description = {
    empty: "Every network starts somewhere. Published ownership records will appear here.",
    "no-matches": "A little too far off the map. Try another search or clear your filters.",
    error: "We lost the thread. Try again to reconnect the dots.",
  }[kind];
  return (
    <Empty className="graph-state gap-5 text-foreground" role="status">
      <EmptyHeader>
        <EmptyMedia>
          <NetworkMotif kind={kind} />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={2}>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

function NetworkMotif({ kind }: { kind: GraphStateKind }) {
  return (
    <svg viewBox="0 0 240 160" className={`graph-state-art graph-state-art--${kind} h-40 w-60 max-w-full`} fill="none" aria-hidden="true">
      <ellipse cx="120" cy="80" rx="104" ry="70" fill="var(--graph-halo)" opacity=".6" />
      <g stroke="var(--graph-funding)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M55 95 88 72 M152 71 190 95" strokeDasharray="4 6" />
        <path d="M55 95 120 125 190 95" opacity=".35" strokeDasharray="3 6" />
      </g>
      {[[55,95,18], [120,50,25], [190,95,18], [120,125,10]].map(([cx,cy,r], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r+5} fill="var(--background)" />
          <circle cx={cx} cy={cy} r={r} fill={i === 1 ? "var(--graph-acquisition)" : "var(--card)"} stroke={i === 1 ? "var(--graph-acquisition)" : "var(--graph-funding)"} strokeWidth="1.5" />
          {i === 1 && kind === "no-matches" && <g stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round"><circle cx="118" cy="48" r="7" /><path d="m123 53 6 6" /></g>}
          {i === 1 && kind !== "no-matches" && <path d={kind === "error" ? "M120 39v13 M120 59v1" : "m116 42 12 8-12 8Z"} stroke="var(--background)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {(i === 0 || i === 2) && <circle cx={cx} cy={cy} r="4" fill="var(--graph-funding)" opacity=".5" />}
        </g>
      ))}
    </svg>
  );
}
