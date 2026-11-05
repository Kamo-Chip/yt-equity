"use client";
import { relationshipEditorSchema, type RelationshipEditor as InputData, type ModeratorChannel, type ModeratorFirm, type ModeratorRelationship, type ModeratorSubmission, type Source } from "@yt-equity/contracts";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "../lib/http";
import { mutateModerator } from "../lib/workspace-mutation";
import { useEntityOptions } from "./use-entity-options";
import { useUnsavedNavigation } from "./use-unsaved-navigation";
export const blankSource = (): Source => ({ url: "", tier: "official" });
export type RelationshipDraftProps = {
  record?: ModeratorRelationship;
  submission?: ModeratorSubmission;
  channels: ModeratorChannel[];
  firms: ModeratorFirm[];
  onClose: () => void;
  onSaved: () => void;
};

export function useRelationshipDraft({ record, submission, channels, firms, onClose, onSaved }: RelationshipDraftProps) {
  const initial = useMemo<InputData>(
    () => {
      const channel = channels.find((candidate) =>
        !!submission?.channelId &&
        (channels.length === 1 || candidate.channelId === submission.channelId ||
          candidate.handle?.toLowerCase() === submission.channelId.toLowerCase()),
      );
      return {
        channel: record
          ? { id: record.channel.id }
          : channel
            ? { id: channel.id }
            : {
              channelId: submission?.channelId ?? "",
              name: "",
              handle: submission?.payload.channelHandle,
            },
        firm: record?.firm ? { id: record.firm.id } : null,
        type: record?.type ?? submission?.payload.type ?? "funding",
        status: record?.status ?? "provisional",
        confidence: record?.confidence ?? 0,
        announcedAt: record?.announcedAt ?? null,
        published: record?.published ?? false,
        sources: record
          ? [
            ...record.sources.map((s) => ({ ...s })),
            ...(submission?.payload.sources ?? [])
              .filter((url) => !record.sources.some((s) => s.url === url))
              .map((url) => ({ url, tier: "community" as const })),
          ]
          : (submission?.payload.sources?.map((url) => ({
            url,
            tier: "community",
          })) ?? [blankSource()]),
      };
    },
    [record, submission, channels],
  );
  const [channelOpen, setChannelOpen] = useState(false),
    [firmOpen, setFirmOpen] = useState(false);
  const [channelSearch, setChannelSearch] = useState(""),
    [firmSearch, setFirmSearch] = useState("");
  const [data, setData] = useState(initial),
    [saving, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState(""),
    [confirm, setConfirm] = useState<"discard" | "archive" | null>(null);
  const busy = saving || uploading;
  const dirty = JSON.stringify(data) !== JSON.stringify(initial);
  const navigation = useUnsavedNavigation(dirty || busy, () =>
    setConfirm("discard"),
  );
  const [channelTerm, setChannelTerm] = useState(""),
    [firmTerm, setFirmTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setChannelTerm(channelSearch), 200);
    return () => clearTimeout(t);
  }, [channelSearch]);
  useEffect(() => {
    const t = setTimeout(() => setFirmTerm(firmSearch), 200);
    return () => clearTimeout(t);
  }, [firmSearch]);
  const channelLookup = useEntityOptions("channels", channelTerm, channelOpen);
  const firmLookup = useEntityOptions("firms", firmTerm, firmOpen);
  function close() {
    if (busy) return;
    if (dirty) setConfirm("discard");
    else onClose();
  }
  function change<K extends keyof InputData>(key: K, value: InputData[K]) {
    setData((old) => ({ ...old, [key]: value }));
    setErrors({});
    setFailure("");
  }
  async function save(published: boolean) {
    if (busy) return;
    setFailure("");
    const parsed = relationshipEditorSchema.safeParse({ ...data, published });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fields[issue.path.join(".")] = issue.message;
      setErrors(fields);
      setTimeout(
        () =>
          document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    setBusy(true);
    try {
      await mutateModerator(
        record ? "relationships/" + record.id : "relationships",
        record ? "PATCH" : "POST", parsed.data,
      );
      toast.success(published ? "Relationship saved." : "Draft saved.");
      onSaved();
    } catch (e) {
      setFailure(
        e instanceof ApiError
          ? e.message
          : "Unable to save. Your changes are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!record || busy) return;
    setBusy(true);
    try {
      await mutateModerator("relationships/" + record.id + "/archive", "POST");
      toast.success("Relationship archived.");
      onSaved();
    } catch (e) {
      setFailure(
        e instanceof ApiError ? e.message : "Unable to archive relationship.",
      );
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  const channelId = "id" in data.channel ? data.channel.id : "new";
  const firmId =
    data.firm && "id" in data.firm ? data.firm.id : data.firm ? "new" : "none";
  const channelOptions = [
    ...[
      ...new Map(
        [
          ...channels,
          ...(channelLookup.data?.resource === "channels"
            ? channelLookup.data.items
            : []),
        ].map((c) => [c.id, c]),
      ).values(),
    ].map((c) => ({
      value: c.id,
      label: c.name + (c.handle ? " · " + c.handle : ""),
    })),
    { value: "new", label: "＋ Create a channel" },
  ];
  const firmOptions = [
    { value: "none", label: "Undisclosed firm" },
    ...[
      ...new Map(
        [
          ...firms,
          ...(firmLookup.data?.resource === "firms" ? firmLookup.data.items : []),
        ].map((f) => [f.id, f]),
      ).values(),
    ].map((f) => ({ value: f.id, label: f.name })),
    { value: "new", label: "＋ Create a firm" },
  ];
  const sourceChange = (i: number, key: keyof Source, value: string) =>
    change(
      "sources",
      data.sources.map((s, index) =>
        index === i ? { ...s, [key]: value || undefined } : s,
      ),
    );
  return { data, busy, setUploading, errors, failure, confirm, setConfirm, navigation, close, change, save, archive, channelId, firmId, channelOptions, firmOptions, channelOpen, setChannelOpen, channelSearch, setChannelSearch, firmOpen, setFirmOpen, firmSearch, setFirmSearch, channelLookup, firmLookup, sourceChange };
}
