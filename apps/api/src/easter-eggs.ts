import type { ChannelEasterEgg } from "@yt-equity/contracts";

export function channelEasterEgg(marker: string | null): ChannelEasterEgg | undefined {
  if (marker === "creator") return { emoji: "👨🏾‍💻", message: "I built this thing." };
  return undefined;
}
