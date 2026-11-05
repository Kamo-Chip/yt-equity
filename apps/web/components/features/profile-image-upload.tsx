"use client";
import { useId, useRef, useState } from "react";
import { MAX_IMAGE_BYTES } from "@yt-equity/contracts";
import { ApiError } from "@/lib/api";
import { mutateModerator } from "@/lib/workspace-mutation";
import { Button } from "@/components/ui/button";

export function ProfileImageUpload({ kind, value, background, disabled, onChange, onBusyChange }: {
  kind: "channels" | "firms";
  value?: string;
  background?: string;
  disabled: boolean;
  onChange: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [uploading, setUploading] = useState(false);
  const [failure, setFailure] = useState("");
  async function upload(file?: File) {
    if (!file || disabled || uploading) return;
    setFailure("");
    if (file.size > MAX_IMAGE_BYTES || !file.size) {
      setFailure("Choose an image smaller than 5 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFailure("Choose a JPG, PNG or WebP image.");
      return;
    }
    setUploading(true);
    onBusyChange(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(new Error("Unable to read image"));
        reader.readAsDataURL(file);
      });
      const result = await mutateModerator<{ url: string }>("media", "POST", { kind, contentType: file.type, base64 });
      onChange(result.url);
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : "Unable to upload the image. Please try again.");
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="grid gap-2">
      {value && (
        // Directory images may be hosted outside Next's image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={`${kind === "channels" ? "Channel" : "Firm"} image preview`} className="size-20 rounded-lg border object-contain" style={{ background }} />
      )}
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
        aria-label={`Choose ${kind === "channels" ? "channel" : "firm"} image`} disabled={disabled || uploading}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void upload(file); }} />
      <Button type="button" variant="outline" disabled={disabled || uploading} onClick={() => input.current?.click()}>
        {uploading ? "Uploading…" : "Upload image"}
      </Button>
      <p className="text-xs text-muted-foreground" role="status">
        {uploading ? "Uploading image. Please wait…" : "JPG, PNG or WebP, up to 5 MB. Save to apply the image."}
      </p>
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    </div>
  );
}
