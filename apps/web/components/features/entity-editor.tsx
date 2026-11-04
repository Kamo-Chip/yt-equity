"use client";
import { useUnsavedNavigation } from "@/hooks/use-unsaved-navigation";
import { useState } from "react";
import {
  channelEditorSchema,
  firmEditorSchema,
  type ModeratorChannel,
  type ModeratorFirm,
} from "@yt-equity/contracts";
import { ApiError } from "@/lib/api";
import { mutateModerator } from "@/lib/workspace-mutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
export function EntityEditor({
  kind,
  record,
  onClose,
  onSaved,
}: {
  kind: "channels" | "firms";
  record?: ModeratorChannel | ModeratorFirm;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: Record<string, string> = Object.fromEntries(
    (kind === "channels"
      ? ["name", "channelId", "handle", "profilePictureUrl"]
      : ["name", "website"]
    ).map((key) => [key, String(record?.[key as keyof typeof record] ?? "")]),
  );
  const [values, setValues] = useState(initial),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [failure, setFailure] = useState(""),
    [confirm, setConfirm] = useState<"delete" | "discard" | null>(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const navigation = useUnsavedNavigation(dirty || busy, () =>
    setConfirm("discard"),
  );
  const title = kind === "channels" ? "channel" : "firm";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v.trim()),
    );
    const parsed = (
      kind === "channels" ? channelEditorSchema : firmEditorSchema
    ).safeParse(data);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join("."), i.message]),
        ),
      );
      return;
    }
    setBusy(true);
    setFailure("");
    try {
      await mutateModerator(kind + (record ? "/" + record.id : ""), record ? "PATCH" : "POST", {
          ...parsed.data,
          ...(record
            ? Object.fromEntries(
                (kind === "channels"
                  ? ["handle", "profilePictureUrl"]
                  : ["website"]
                )
                  .filter((key) => !values[key].trim())
                  .map((key) => [key, null]),
              )
            : {}),
      });
      onSaved();
    } catch (e) {
      setFailure(e instanceof ApiError ? e.message : "Unable to save record.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!record || busy) return;
    setBusy(true);
    try {
      await mutateModerator(kind + "/" + record.id, "DELETE");
      onSaved();
    } catch (e) {
      setFailure(
        e instanceof ApiError ? e.message : "Unable to delete record.",
      );
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (!busy) {
      if (dirty) setConfirm("discard");
      else onClose();
    }
  };
  const labels: Record<string, string> = {
    name: "Name",
    channelId: "YouTube channel ID or handle",
    handle: "Handle (optional)",
    profilePictureUrl: "Profile image URL (optional)",
    website: "Website (optional)",
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {record ? "Edit" : "Create"} {title}
            </DialogTitle>
            <DialogDescription>
              Manage {title} details used throughout the directory.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save}>
            <fieldset disabled={busy} className="grid gap-4">
              {Object.entries(values).map(([key, value]) => (
                <Field key={key} data-invalid={!!errors[key]}>
                  <FieldLabel htmlFor={"entity-" + key}>
                    {labels[key]}
                  </FieldLabel>
                  <Input
                    id={"entity-" + key}
                    value={value}
                    aria-invalid={!!errors[key]}
                    onChange={(e) => {
                      setValues((old) => ({ ...old, [key]: e.target.value }));
                      setErrors({});
                    }}
                  />
                  {errors[key] && <FieldError>{errors[key]}</FieldError>}
                </Field>
              ))}
              {failure && (
                <p role="alert" className="text-sm text-destructive">
                  {failure}
                </p>
              )}
              <div className="flex gap-2 pt-3">
                {record && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mr-auto text-destructive"
                    onClick={() => setConfirm("delete")}
                  >
                    Delete
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button>{busy ? "Saving…" : "Save " + title}</Button>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? `Delete this ${title}?`
                : "Discard unsaved changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Records used by relationships cannot be deleted."
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
                if (confirm === "delete") {
                  e.preventDefault();
                  remove();
                } else navigation.discard(onClose);
              }}
            >
              {confirm === "delete" ? "Delete" : "Discard changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
