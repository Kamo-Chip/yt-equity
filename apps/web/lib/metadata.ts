import type { Metadata } from "next";

export const siteDescription = "Research who owns and funds YouTube channels.";
export const privateRobots: Metadata["robots"] = {
  index: false, follow: false, noarchive: true,
};
const socialImage = {
  url: "/og-image.png", width: 1200, height: 630,
  alt: "YT Equity — Research who owns and funds YouTube channels.",
};

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const socialTitle = `${title} — YT Equity`;
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: {
      type: "website", siteName: "YT Equity", title: socialTitle,
      description, url: path, images: [socialImage],
    },
    twitter: {
      card: "summary_large_image", title: socialTitle,
      description, images: [socialImage],
    },
  };
}
