import { redirect } from "next/navigation";
export default async function ChannelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const part of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, part);
  redirect("/" + (query.size ? "?" + query.toString() : ""));
}
