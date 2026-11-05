import { publicMetadata } from "@/lib/metadata";
import Link from "next/link";

export const metadata = publicMetadata("Extension privacy policy", "What the YT Equity extension sends, stores, and keeps private.", "/privacy");

export default function PrivacyPage() {
  return (
    <main className="container page max-w-3xl space-y-6 text-sm leading-7">
      <header>
        <h1 className="page-heading">Extension privacy policy</h1>
        <p className="text-muted-foreground">Effective 4 November 2026</p>
      </header>
      <ul className="list-disc space-y-3 pl-5">
        <li>
          To show ownership and funding records, the extension sends channel handles
          and IDs from YouTube pages and video lists to YT Equity over HTTPS. This
          happens by default, even with video hiding off, and can reveal channels
          you browse.
        </li>
        <li>
          It does not send video titles or URLs, searches, comments, account
          details, passwords, or cookies. It has no analytics or advertising SDK.
        </li>
        <li>
          We do not save these channel requests in our database or build a viewing
          profile. Cached results expire after five minutes. Settings stay in your browser
          without syncing.
        </li>
        <li>
          Servers receive your IP address to deliver responses. Our application
          request logs do not record it. Hosting providers may retain IP addresses
          and connection details in their own service logs; contact us for retention
          details or deletion requests.
        </li>
        <li>
          Data is used to provide and secure the service, never sold or used for
          advertising. Processing is limited to us and our hosting providers, unless
          disclosure is legally required.
        </li>
        <li>
          No account is needed. Disable the extension to stop sending channel
          information. Refresh YouTube to remove badges and filtering. Uninstalling
          removes saved settings.
        </li>
        <li>
          Reports open on our website; avoid sensitive information. Optional support
          payments happen on YouTube under its policies. We do not receive payment
          details.
        </li>
        <li>
          Privacy questions or access or deletion requests? Use the{" "}
          <Link className="underline" href="/report">report form</Link> and include
          contact details for a reply. Policy updates appear here; material changes
          to data use require disclosure and consent first.
        </li>
      </ul>
    </main>
  );
}
