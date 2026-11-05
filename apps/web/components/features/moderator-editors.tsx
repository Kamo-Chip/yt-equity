"use client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ModeratorChannel,
  ModeratorFirm,
  ModeratorRelationship,
  SubmissionContext
} from "@yt-equity/contracts";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useState
} from "react";
import { EntityEditor } from "./entity-editor";
import { RelationshipEditor } from "./relationship-editor";

import { useModeratorNavigation } from "./moderator-navigation";
export function EditorSheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { update } = useModeratorNavigation();
  const params = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Radix portals render only after hydration. Keep the streamed loading/error
  // frame visible in the initial HTML, then hand focus management to Radix.
  if (!mounted) {
    const query = new URLSearchParams(params);
    for (const key of ["edit", "source", "entity", "entityId"])
      query.delete(key);
    return (
      <>
        <div className="fixed inset-0 z-50 bg-black/50" />
        <section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col gap-4 border-l bg-background shadow-lg sm:max-w-2xl"
        >
          <div className="flex flex-col gap-1.5 p-4">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Manage directory records.
            </p>
          </div>
          {children}
          <a
            className="absolute right-4 top-4 text-sm underline"
            href={"/moderator" + (query.size ? "?" + query : "")}
          >
            Close
          </a>
        </section>
      </>
    );
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open)
          update({ edit: null, source: null, entity: null, entityId: null });
      }}
    >
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Manage directory records.</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
export function RelationshipForm({
  record,
  context,
}: {
  record?: ModeratorRelationship;
  context?: SubmissionContext;
}) {
  const { update } = useModeratorNavigation();
  const close = () => update({ edit: null, source: null });
  return (
    <RelationshipEditor
      record={record}
      submission={context?.submission}
      channels={
        context?.channel ? [context.channel] : record ? [record.channel] : []
      }
      firms={record?.firm ? [record.firm] : []}
      onClose={close}
      onSaved={close}
    />
  );
}
export function EntityForm({
  kind,
  record,
}: {
  kind: "channels" | "firms";
  record?: ModeratorChannel | ModeratorFirm;
}) {
  const { update } = useModeratorNavigation();
  const close = () => update({ entity: null, entityId: null });
  return (
    <EntityEditor kind={kind} record={record} onClose={close} onSaved={close} />
  );
}
