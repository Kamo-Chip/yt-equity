import type { Metadata } from "next";
import { privateRobots } from "@/lib/metadata";
import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/features/theme-provider";
import { AuthPageContent } from "@/components/features/page-motion";
export const metadata: Metadata = { robots: privateRobots };

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell min-h-dvh">
      <header className="flex h-20 items-center justify-between px-6 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 font-bold">
          <Image src="/brand-mark.svg" unoptimized width={32} height={32} alt="" aria-hidden="true" className="brand-mark" />
          YT Equity
        </Link>
        <ThemeToggle />
      </header>
      <AuthPageContent>
        {children}
      </AuthPageContent>
    </div>
  );
}
