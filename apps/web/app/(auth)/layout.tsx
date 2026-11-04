import Link from "next/link";
import { Play } from "lucide-react";
import { ThemeToggle } from "@/components/features/theme-provider";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell min-h-dvh">
      <header className="flex h-20 items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 font-bold">
          <span className="brand-mark">
            <Play size={15} fill="currentColor" />
          </span>
          YT Equity
        </Link>
        <ThemeToggle />
      </header>
      <div className="mx-auto w-full max-w-[480px] px-5 pt-8 md:pt-16">
        {children}
      </div>
    </div>
  );
}
