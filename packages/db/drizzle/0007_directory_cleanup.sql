DROP TABLE "disputes";
--> statement-breakpoint
UPDATE "submissions" SET "payload" = "payload" - 'kind' - 'channelId' - 'contactEmail';
--> statement-breakpoint
ALTER TABLE "moderator_invitations" RENAME CONSTRAINT "moderator_invitations_email_key" TO "moderator_invitations_email_unique";
