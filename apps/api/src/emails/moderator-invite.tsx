import { EmailButton, EmailCopy, EmailFrame, EmailHeading } from "./components.js";

export function ModeratorInviteEmail({ url }: { url: string }) {
  return (
    <EmailFrame preview="You have been invited to moderate YT Equity">
      <EmailHeading>You’re invited to moderate YT Equity</EmailHeading>
      <EmailCopy>Use the secure link below to sign in and activate your moderator access.</EmailCopy>
      <EmailButton href={url}>Accept invitation</EmailButton>
      <EmailCopy>This link is single-use and expires shortly. If you did not expect this invitation, you can ignore this email.</EmailCopy>
    </EmailFrame>
  );
}
