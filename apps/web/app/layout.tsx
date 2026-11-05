import type { Metadata } from "next";
import { publicMetadata, siteDescription } from "@/lib/metadata";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/features/theme-provider";
import { UnsavedNavigationProvider } from "@/hooks/use-unsaved-navigation";
import { RefreshOnReturn } from "@/components/features/refresh-on-return";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000"),
  ...publicMetadata("Ownership graph", siteDescription, "/"),
  title: { default: "Ownership graph — YT Equity", template: "%s — YT Equity" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <UnsavedNavigationProvider>
              <RefreshOnReturn />
              {children}
            </UnsavedNavigationProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
