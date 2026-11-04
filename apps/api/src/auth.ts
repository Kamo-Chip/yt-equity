import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@yt-equity/db/client";
import { Resend } from "resend";
import { MagicLinkEmail } from "./emails/magic-link.js";
import { ModeratorInviteEmail } from "./emails/moderator-invite.js";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.WEB_ORIGIN ?? "http://localhost:3000",
  database: drizzleAdapter(db, { provider: "pg" }),
  user: { additionalFields: { role: { type: "string", required: false, input: false } } },
  trustedOrigins: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
  plugins: [magicLink({
    sendMagicLink: async ({ email, url, metadata }) => {
      if (!process.env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is required to send sign-in emails");
      }
      const resend = new Resend(process.env.RESEND_API_KEY);
      const invitation = Boolean((metadata as { invitation?: boolean } | undefined)?.invitation);
      const result = await resend.emails.send({ from: process.env.RESEND_FROM ?? "YT Equity <onboarding@resend.dev>", to: email, subject: invitation ? "You’re invited to moderate YT Equity" : "Your YT Equity sign-in link", react: invitation ? ModeratorInviteEmail({ url }) : MagicLinkEmail({ url }) });
      if (result.error) throw new Error(`Email delivery failed: ${result.error.message}`);
    }
  })]
});
