import { EmailButton, EmailCopy, EmailFrame, EmailHeading } from "./components.js";

export function MagicLinkEmail({ url }: { url: string }) {
  return (
    <EmailFrame preview="Your YT Equity sign-in link">
      <EmailHeading>Sign in to YT Equity</EmailHeading>
      <EmailCopy>Use this secure link to access your workspace.</EmailCopy>
      <EmailButton href={url}>Sign in</EmailButton>
      <EmailCopy>If you did not request this link, you can ignore this email.</EmailCopy>
    </EmailFrame>
  );
}
