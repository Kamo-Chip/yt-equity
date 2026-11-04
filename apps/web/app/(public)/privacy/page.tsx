import Link from "next/link";

export const metadata = {
  title: "Extension privacy policy — YT Equity",
  description: "How the YT Equity browser extension handles channel lookups and local preferences.",
};

export default function PrivacyPage() {
  return (
    <main className="container page max-w-3xl space-y-6 text-sm leading-7">
      <header>
        <h1 className="page-heading">Extension privacy policy</h1>
        <p className="text-muted-foreground">Effective 4 November 2026</p>
      </header>
      <p>
        YT Equity shows public ownership and funding records for YouTube channels
        and can hide matching videos. This policy covers the YT Equity browser
        extension and its public channel lookup service.
      </p>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What the extension sends</h2>
        <p>
          Ownership lookups are enabled by default. The extension reads channel handles and channel
          IDs from YouTube channel pages, the current video’s channel, and video
          lists, including Home, search results, suggested videos, and subscriptions.
          It sends those identifiers to the YT Equity API over HTTPS to retrieve
          public ownership and funding records. This can reveal channels you browse,
          even when video hiding is switched off.
        </p>
        <p>
          The lookup payload contains channel identifiers only. It does not contain
          video URLs, video titles, search terms, comments, your YouTube account,
          passwords, or cookies. The extension does not use an analytics or
          advertising SDK. API requests omit credentials and referrer information.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Service processing and retention</h2>
        <p>
          The API uses the identifiers to query the public directory. Lookup
          requests are not saved to the application database or used to build a
          personal viewing profile. The extension caches lookup results in memory
          with an expiration of at most five minutes. Filter preferences and your
          lookup choice are saved locally in your browser profile, without browser
          sync, until you change them or remove the extension.
        </p>
        <p>
          As with other HTTPS services, the API and its hosting providers receive
          your IP address and connection metadata. Operational logs may include
          request times, the lookup endpoint, response status, and IP addresses.
          Hosting providers process this information to deliver and secure the
          service. Infrastructure log retention depends on the service hosting
          configuration; contact us for the current retention period or a deletion
          request. Channel identifiers are sent in request bodies rather than URLs.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Use and sharing</h2>
        <p>
          Lookup information is used to provide ownership records, badges, and
          filtering, and to operate and secure that service. It is not sold, used
          for advertising, or shared for unrelated profiling. Processing is limited
          to YT Equity and the infrastructure providers needed to run the service,
          except where disclosure is required by law. YT Equity’s use of extension
          user data complies with the Chrome Web Store User Data Policy, including
          its Limited Use requirements.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your choices and external links</h2>
        <p>
          Disable the extension in your browser’s extension settings to stop new
          lookups. Refresh open YouTube pages to remove existing badges and filtering.
          An HTTPS request already sent cannot be recalled.
          Uninstalling the extension removes its local preferences. No account is
          required to use the extension.
        </p>
        <p>
          Record, report, and website links open the YT Equity website. Information
          you submit in a report is handled separately from automatic lookups; do
          not include sensitive information. The support link opens a YouTube video
          and may open its Super Thanks chooser. You choose the amount and confirm
          any payment in YouTube. YouTube and its payment providers handle that
          interaction under their own policies; the extension does not receive your
          payment details.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact and changes</h2>
        <p>
          For privacy questions or access/deletion requests, use the{" "}
          <Link className="underline" href="/report">YT Equity contact form</Link>
          {" "}and describe your privacy request. Include a way for us to reply if you want a
          response. Updates to this policy will appear on this page. A material
          change to the extension’s data use will require updated disclosure and
          consent before that use starts.
        </p>
      </section>
    </main>
  );
}
