"use server";
import { reportSchema, submissionSchema } from "@yt-equity/contracts";
import { z } from "zod";
import { getChannel } from "../lib/api";

export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};
export async function requestMagicLink(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success)
    return { ok: false, message: "Enter a valid moderator email." };
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/api/auth/sign-in/magic-link`,
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: webOrigin },
        body: JSON.stringify({ email, callbackURL: `${webOrigin}/workspace` }),
      },
    );
    return response.ok
      ? { ok: true, message: "Check your email for a sign-in link." }
      : {
          ok: false,
          message:
            response.status === 403
              ? "This email does not have workspace access."
              : "Unable to request a sign-in link right now.",
        };
  } catch {
    return { ok: false, message: "The API is unavailable. Try again shortly." };
  }
}
export async function submitContribution(
  _: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mode = formData.get("contribution") || "report";
  if (!["report", "correction", "dispute"].includes(String(mode)))
    return { ok: false, message: "Choose a valid contribution type." };
  const parsed = submissionSchema.safeParse({
    kind: mode === "dispute" ? "dispute" : "correction",
    channelId: formData.get("channelId"),
    claimId: formData.get("claimId") || undefined,
    type: formData.get("type") || undefined,
    explanation: formData.get("explanation"),
    sources: formData
      .getAll("sources")
      .map((url) => String(url).trim())
      .filter(Boolean),
    contactEmail: formData.get("contactEmail") || undefined,
  });
  if (!parsed.success)
    return {
      ok: false,
      message: "Check the highlighted fields and try again.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.path[0] === "contactEmail"
            ? "Enter a valid email address."
            : issue.path[0] === "sources"
              ? "Add a valid source link (up to five)."
              : issue.path[0] === "explanation"
                ? "Use 10–4,000 characters."
                : issue.path[0] === "channelId"
                  ? "Enter a channel handle or ID, such as @channel or UC…"
                  : issue.message,
        ]),
      ),
    };
  try {
    const channel = await getChannel(parsed.data.channelId);
    if (!channel && mode !== "report")
      return {
        ok: false,
        message:
          "This channel isn’t in the directory. Choose ‘Report ownership or funding’ to submit it for review.",
        fieldErrors: {
          channelId:
            "Choose an existing channel, or change the contribution type to report it.",
        },
      };
    const payload = {
      ...parsed.data,
      channelId: channel?.channelId ?? parsed.data.channelId,
      kind: channel ? parsed.data.kind : "new_channel",
    };
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:4000"}/api/v1/submissions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    if (response.status === 409)
      return {
        ok: false,
        message: "A similar submission is already under review.",
      };
    if (response.status === 429)
      return { ok: false, message: "Too many submissions. Try again later." };
    if (response.status === 400) {
      const error = await response.json();
      if (error.error?.code === "UNKNOWN_CHANNEL")
        return {
          ok: false,
          message:
            "This channel isn’t in the directory. Choose ‘Report ownership or funding’ to submit it for review.",
          fieldErrors: {
            channelId:
              "Choose an existing channel, or change the contribution type to report it.",
          },
        };
    }
    return response.ok
      ? { ok: true, message: "Thanks — your contribution is now in review." }
      : { ok: false, message: "We couldn't submit that right now." };
  } catch {
    return { ok: false, message: "The API is unavailable. Try again shortly." };
  }
}

export type ReportState = ActionState & {
  values: { explanation: string; contactEmail: string };
};
export async function submitReport(
  _: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const values = {
    explanation: String(formData.get("explanation") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
  };
  const parsed = reportSchema.safeParse({
    ...values,
    contactEmail: values.contactEmail.trim() || undefined,
  });
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0].message,
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((issue) => [
          issue.path.join("."),
          issue.message,
        ]),
      ),
      values,
    };
  try {
    const response = await fetch(
      `${(process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/$/, "")}/api/v1/reports`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        cache: "no-store",
      },
    );
    if (response.ok)
      return {
        ok: true,
        message: "Report sent. Thank you.",
        values: { explanation: "", contactEmail: "" },
      };
    return {
      ok: false,
      message:
        response.status === 429
          ? "Too many reports. Try again later."
          : "Couldn’t send your report. Try again.",
      values,
    };
  } catch {
    return {
      ok: false,
      message: "Couldn’t send your report. Try again.",
      values,
    };
  }
}
