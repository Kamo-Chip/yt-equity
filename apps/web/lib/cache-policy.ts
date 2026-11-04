export const PUBLIC_DIRECTORY_TAG = "public-directory";

export function changesPublicDirectory(method: string, path: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method) &&
    /^\/api\/v1\/moderator\/(relationships|channels|firms|claims|evidence|aliases)(\/|$)/.test(path);
}
