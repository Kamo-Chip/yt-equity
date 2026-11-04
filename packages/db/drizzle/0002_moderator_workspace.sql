ALTER TYPE "reviewer_role" RENAME TO "workspace_role";--> statement-breakpoint
ALTER TYPE "workspace_role" RENAME VALUE 'reviewer' TO 'moderator';--> statement-breakpoint
ALTER TABLE "moderation_decisions" RENAME COLUMN "reviewer_id" TO "moderator_id";--> statement-breakpoint
CREATE TABLE "moderator_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "token_hash" text NOT NULL,
  "invited_by" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "last_sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
