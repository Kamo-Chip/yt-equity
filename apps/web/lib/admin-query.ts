import {
  adminUsersQuerySchema,
  adminInvitationsQuerySchema,
} from "@yt-equity/contracts";
export type AdminSection = "users" | "invitations";
export function adminLocation(params: URLSearchParams) {
  function fields(section: AdminSection) {
    return Object.fromEntries(
      ["q", "page", "pageSize", "sort", "direction", "status"].map((key) => [
        key,
        params.get(section + key[0].toUpperCase() + key.slice(1)) ?? undefined,
      ]),
    );
  }
  const users = adminUsersQuerySchema.safeParse(fields("users"));
  const invitations = adminInvitationsQuerySchema.safeParse(
    fields("invitations"),
  );
  return {
    users: users.success ? users.data : adminUsersQuerySchema.parse({}),
    invitations: invitations.success
      ? invitations.data
      : adminInvitationsQuerySchema.parse({}),
  };
}
