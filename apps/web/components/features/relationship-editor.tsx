"use client";
import { useEffect, useMemo, useState } from "react";
import { useEntityOptions } from "@/hooks/use-entity-options";
import { mutateModerator } from "@/lib/workspace-mutation";
import { useUnsavedNavigation } from "@/hooks/use-unsaved-navigation";
import { toast } from "sonner";
import {
  relationshipEditorSchema,
  type ModeratorChannel,
  type ModeratorFirm,
  type ModeratorRelationship,
  type RelationshipEditor as InputData,
  type Source,
} from "@yt-equity/contracts";
import { ApiError, type PendingSubmission } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldDescription,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Plus, Trash2, ChevronDown, Check } from "lucide-react";
const blankSource = (): Source => ({ url: "", tier: "official" });
export function RelationshipEditor({
  record,
  submission,
  channels,
  firms,
  onClose,
  onSaved,
}: {
  record?: ModeratorRelationship;
  submission?: PendingSubmission;
  channels: ModeratorChannel[];
  firms: ModeratorFirm[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo<InputData>(
    () => ({
      channel: record
        ? { id: record.channel.id }
        : channels.find(
              (c) =>
                !!submission?.channelId &&
                (channels.length === 1 ||
                  c.channelId === submission.channelId ||
                  c.handle?.toLowerCase() ===
                    submission.channelId?.toLowerCase()),
            )
          ? {
              id: channels.find(
                (c) =>
                  !!submission?.channelId &&
                  (channels.length === 1 ||
                    c.channelId === submission.channelId ||
                    c.handle?.toLowerCase() ===
                      submission.channelId?.toLowerCase()),
              )!.id,
            }
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
    }),
    [record, submission, channels],
  );
  const [channelOpen, setChannelOpen] = useState(false),
    [firmOpen, setFirmOpen] = useState(false);
  const [channelSearch, setChannelSearch] = useState(""),
    [firmSearch, setFirmSearch] = useState("");
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState(""),
    [confirm, setConfirm] = useState<"discard" | "archive" | null>(null);
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
      await mutateModerator("claims/" + record.id + "/archive", "POST");
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
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          className="w-full gap-0 p-0 sm:max-w-[680px]"
          onInteractOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <SheetHeader className="shrink-0 border-b p-6">
            <SheetTitle>
              {record ? "Edit relationship" : "Create relationship"}
            </SheetTitle>
            <SheetDescription>
              Connect a channel, its funding or acquisition, and the evidence.
            </SheetDescription>
          </SheetHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              save(data.published && data.status === "confirmed");
            }}
          >
            <fieldset
              disabled={busy}
              className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-6 py-5"
            >
              <Field>
                <FieldLabel htmlFor="relationship-channel">Channel</FieldLabel>
                <Popover open={channelOpen} onOpenChange={setChannelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="relationship-channel"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={channelOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {channelOptions.find((o) => o.value === channelId)
                          ?.label ?? "Select channel"}
                      </span>
                      <ChevronDown />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search channels"
                        value={channelSearch}
                        onValueChange={setChannelSearch}
                      />
                      {channelLookup.error && (
                        <div
                          role="alert"
                          className="px-3 py-2 text-xs text-destructive"
                        >
                          Channel search is unavailable.{" "}
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => channelLookup.retry()}
                          >
                            Retry
                          </Button>
                        </div>
                      )}
                      {channelLookup.loading && (
                        <p
                          role="status"
                          className="px-3 py-2 text-xs text-muted-foreground"
                        >
                          Searching channels…
                        </p>
                      )}
                      <CommandList>
                        <CommandEmpty>
                          {channelLookup.loading
                            ? "Searching channels…"
                            : "No channels found."}
                        </CommandEmpty>
                        <CommandGroup>
                          {channelOptions
                            .filter(
                              (o) =>
                                o.value === "new" ||
                                o.label
                                  .toLowerCase()
                                  .includes(channelSearch.toLowerCase()),
                            )
                            .map((o) => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => {
                                  change(
                                    "channel",
                                    o.value === "new"
                                      ? { channelId: "", name: channelSearch }
                                      : { id: o.value },
                                  );
                                  setChannelOpen(false);
                                  setChannelSearch("");
                                }}
                              >
                                <Check
                                  className={
                                    channelId === o.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  }
                                />
                                {o.label}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
              {!("id" in data.channel) && (
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors["channel.channelId"]}>
                    <FieldLabel htmlFor="new-channel-id">
                      YouTube channel ID or handle
                    </FieldLabel>
                    <Input
                      id="new-channel-id"
                      value={data.channel.channelId}
                      aria-invalid={!!errors["channel.channelId"]}
                      onChange={(e) =>
                        change("channel", {
                          ...(data.channel as Exclude<
                            InputData["channel"],
                            { id: string }
                          >),
                          channelId: e.target.value,
                        })
                      }
                    />
                    {errors["channel.channelId"] && (
                      <FieldError>{errors["channel.channelId"]}</FieldError>
                    )}
                  </Field>
                  <Field data-invalid={!!errors["channel.name"]}>
                    <FieldLabel htmlFor="new-channel-name">
                      Channel name
                    </FieldLabel>
                    <Input
                      id="new-channel-name"
                      value={data.channel.name}
                      aria-invalid={!!errors["channel.name"]}
                      onChange={(e) =>
                        change("channel", {
                          ...(data.channel as Exclude<
                            InputData["channel"],
                            { id: string }
                          >),
                          name: e.target.value,
                        })
                      }
                    />
                    {errors["channel.name"] && (
                      <FieldError>{errors["channel.name"]}</FieldError>
                    )}
                  </Field>
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="relationship-firm">Firm</FieldLabel>
                <Popover open={firmOpen} onOpenChange={setFirmOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="relationship-firm"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={firmOpen}
                      className="w-full justify-between"
                    >
                      <span className="truncate">
                        {firmOptions.find((o) => o.value === firmId)?.label ??
                          "Select firm"}
                      </span>
                      <ChevronDown />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search firms"
                        value={firmSearch}
                        onValueChange={setFirmSearch}
                      />
                      {firmLookup.error && (
                        <div
                          role="alert"
                          className="px-3 py-2 text-xs text-destructive"
                        >
                          Firm search is unavailable.{" "}
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => firmLookup.retry()}
                          >
                            Retry
                          </Button>
                        </div>
                      )}
                      {firmLookup.loading && (
                        <p
                          role="status"
                          className="px-3 py-2 text-xs text-muted-foreground"
                        >
                          Searching firms…
                        </p>
                      )}
                      <CommandList>
                        <CommandEmpty>No firms found.</CommandEmpty>
                        <CommandGroup>
                          {firmOptions
                            .filter(
                              (o) =>
                                o.value === "new" ||
                                o.label
                                  .toLowerCase()
                                  .includes(firmSearch.toLowerCase()),
                            )
                            .map((o) => (
                              <CommandItem
                                key={o.value}
                                value={o.value}
                                onSelect={() => {
                                  change(
                                    "firm",
                                    o.value === "none"
                                      ? null
                                      : o.value === "new"
                                        ? { name: firmSearch }
                                        : { id: o.value },
                                  );
                                  setFirmOpen(false);
                                  setFirmSearch("");
                                }}
                              >
                                <Check
                                  className={
                                    firmId === o.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  }
                                />
                                {o.label}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
              {data.firm && !("id" in data.firm) && (
                <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors["firm.name"]}>
                    <FieldLabel htmlFor="new-firm-name">Firm name</FieldLabel>
                    <Input
                      id="new-firm-name"
                      value={data.firm.name}
                      aria-invalid={!!errors["firm.name"]}
                      onChange={(e) =>
                        change("firm", {
                          ...(data.firm as { name: string; website?: string }),
                          name: e.target.value,
                        })
                      }
                    />
                    {errors["firm.name"] && (
                      <FieldError>{errors["firm.name"]}</FieldError>
                    )}
                  </Field>
                  <Field data-invalid={!!errors["firm.website"]}>
                    <FieldLabel htmlFor="new-firm-site">
                      Website (optional)
                    </FieldLabel>
                    <Input
                      id="new-firm-site"
                      value={data.firm.website ?? ""}
                      aria-invalid={!!errors["firm.website"]}
                      onChange={(e) =>
                        change("firm", {
                          ...(data.firm as { name: string; website?: string }),
                          website: e.target.value || undefined,
                        })
                      }
                    />
                    {errors["firm.website"] && (
                      <FieldError>{errors["firm.website"]}</FieldError>
                    )}
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="relationship-type">
                    Relationship
                  </FieldLabel>
                  <NativeSelect
                    id="relationship-type"
                    value={data.type}
                    onChange={(e) =>
                      change("type", e.target.value as InputData["type"])
                    }
                  >
                    <NativeSelectOption value="funding">
                      Funding
                    </NativeSelectOption>
                    <NativeSelectOption value="acquisition">
                      Acquisition
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="relationship-status">
                    Record status
                  </FieldLabel>
                  <NativeSelect
                    id="relationship-status"
                    value={data.status}
                    onChange={(e) =>
                      change("status", e.target.value as InputData["status"])
                    }
                  >
                    {["provisional", "confirmed", "disputed", "rejected"].map(
                      (v) => (
                        <NativeSelectOption key={v} value={v}>
                          {v[0].toUpperCase() + v.slice(1)}
                        </NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
                </Field>
              </div>
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Evidence</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.sources.length >= 50}
                    onClick={() =>
                      change("sources", [...data.sources, blankSource()])
                    }
                  >
                    <Plus />
                    Add source
                  </Button>
                </div>
                <div className="grid gap-3">
                  {data.sources.map((s, i) => (
                    <div className="source-card" key={i}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">
                          Source {i + 1}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove source ${i + 1}`}
                          onClick={() =>
                            change(
                              "sources",
                              data.sources.filter((_, index) => index !== i),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <Field data-invalid={!!errors[`sources.${i}.url`]}>
                        <FieldLabel htmlFor={`source-url-${i}`}>
                          Source URL
                        </FieldLabel>
                        <Input
                          id={`source-url-${i}`}
                          value={s.url}
                          aria-invalid={!!errors[`sources.${i}.url`]}
                          onChange={(e) =>
                            sourceChange(i, "url", e.target.value)
                          }
                          placeholder="https://…"
                        />
                        {errors[`sources.${i}.url`] && (
                          <FieldError>{errors[`sources.${i}.url`]}</FieldError>
                        )}
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor={`source-title-${i}`}>
                            Title (optional)
                          </FieldLabel>
                          <Input
                            id={`source-title-${i}`}
                            value={s.title ?? ""}
                            onChange={(e) =>
                              sourceChange(i, "title", e.target.value)
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`source-tier-${i}`}>
                            Evidence tier
                          </FieldLabel>
                          <NativeSelect
                            id={`source-tier-${i}`}
                            value={s.tier}
                            onChange={(e) =>
                              sourceChange(i, "tier", e.target.value)
                            }
                          >
                            {["official", "reputable", "community"].map((t) => (
                              <NativeSelectOption key={t} value={t}>
                                {t[0].toUpperCase() + t.slice(1)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                      </div>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button type="button" size="sm" variant="ghost">
                            Source details
                            <ChevronDown />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="grid gap-3 pt-3">
                          <Field>
                            <FieldLabel htmlFor={`source-publisher-${i}`}>
                              Publisher
                            </FieldLabel>
                            <Input
                              id={`source-publisher-${i}`}
                              value={s.publisher ?? ""}
                              onChange={(e) =>
                                sourceChange(i, "publisher", e.target.value)
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`source-date-${i}`}>
                              Publication date
                            </FieldLabel>
                            <Input
                              id={`source-date-${i}`}
                              type="date"
                              value={s.publishedAt?.slice(0, 10) ?? ""}
                              onChange={(e) =>
                                sourceChange(
                                  i,
                                  "publishedAt",
                                  e.target.value
                                    ? new Date(e.target.value).toISOString()
                                    : "",
                                )
                              }
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={`source-notes-${i}`}>
                              Notes
                            </FieldLabel>
                            <Textarea
                              id={`source-notes-${i}`}
                              value={s.notes ?? ""}
                              onChange={(e) =>
                                sourceChange(i, "notes", e.target.value)
                              }
                            />
                          </Field>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ))}
                </div>
              </section>
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    Additional details
                    <ChevronDown />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-4 pt-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.confidence}>
                    <FieldLabel htmlFor="relationship-confidence">
                      Confidence (%)
                    </FieldLabel>
                    <Input
                      id="relationship-confidence"
                      type="number"
                      min={0}
                      max={100}
                      value={data.confidence}
                      aria-invalid={!!errors.confidence}
                      onChange={(e) =>
                        change("confidence", Number(e.target.value))
                      }
                    />
                    {errors.confidence && (
                      <FieldError>{errors.confidence}</FieldError>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="relationship-date">
                      Announcement date
                    </FieldLabel>
                    <Input
                      id="relationship-date"
                      type="date"
                      value={data.announcedAt?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        change(
                          "announcedAt",
                          e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        )
                      }
                    />
                  </Field>
                </CollapsibleContent>
              </Collapsible>
              <FieldDescription>
                {record?.published && data.status !== "confirmed"
                  ? "Saving this status will remove the relationship from public views."
                  : data.status !== "confirmed"
                    ? "Choose Confirmed status to publish this relationship."
                    : "Confirmed relationships can be published to the directory."}
                Relationships with an undisclosed firm appear on channel
                profiles, but have no firm node in the graph.
              </FieldDescription>
              {Object.keys(errors).length > 0 && (
                <div role="alert" className="text-sm text-destructive">
                  Check the highlighted fields.
                  {Object.entries(errors)
                    .filter(
                      ([key]) =>
                        ![
                          "channel.channelId",
                          "channel.name",
                          "firm.name",
                          "firm.website",
                          "confidence",
                        ].includes(key) && !/^sources\.\d+\.url$/.test(key),
                    )
                    .map(([key, message]) => (
                      <p key={key}>
                        {key}: {message}
                      </p>
                    ))}
                </div>
              )}
            </fieldset>
            <fieldset
              disabled={busy}
              className="flex shrink-0 flex-wrap gap-2 border-t bg-card px-6 py-4"
            >
              {failure && (
                <p role="alert" className="w-full text-sm text-destructive">
                  {failure}
                </p>
              )}
              {record && (
                <Button
                  variant="ghost"
                  type="button"
                  className="mr-auto text-destructive"
                  onClick={() => setConfirm("archive")}
                >
                  Archive
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              {!record?.published && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save(false)}
                >
                  {busy ? "Saving…" : "Save draft"}
                </Button>
              )}
              <Button
                type="button"
                disabled={!record?.published && data.status !== "confirmed"}
                onClick={() => save(data.status === "confirmed")}
              >
                {busy
                  ? "Saving…"
                  : record?.published
                    ? "Save changes"
                    : "Publish relationship"}
              </Button>
            </fieldset>
          </form>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "archive"
                ? "Archive this relationship?"
                : "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "archive"
                ? "The relationship will be removed from public views. It remains available as a draft."
                : "Your unsaved edits will be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={navigation.keepEditing}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                if (confirm === "archive") {
                  e.preventDefault();
                  archive();
                } else navigation.discard(onClose);
              }}
            >
              {confirm === "archive"
                ? "Archive relationship"
                : "Discard changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
