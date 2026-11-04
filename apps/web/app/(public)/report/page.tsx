import Link from "next/link";
import styles from "./report.module.css";
import { ReportForm } from "@/components/features/report-form";

export const metadata = { title: "Report an issue — YT Equity" };

export default function ReportPage() {
  return (
    <main className={`container page page-narrow ${styles.report}`}>
      <h1 className="page-heading">Report an issue</h1>
      <p className={styles.intro}>
        Tell us what went wrong or what we can improve.
      </p>
      <ReportForm />
      <p className="mt-6 text-sm text-muted-foreground">
        Have ownership or funding information?{" "}
        <Link className="underline" href="/report/channel">
          Report a channel
        </Link>
        .
      </p>
    </main>
  );
}
