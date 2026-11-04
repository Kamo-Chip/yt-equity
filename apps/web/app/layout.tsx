import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/features/theme-provider";
import { UnsavedNavigationProvider } from "@/hooks/use-unsaved-navigation";
import { RefreshOnReturn } from "@/components/features/refresh-on-return";
export const metadata = {
  title: "YT Equity — Ownership graph",
  description: "Research who owns and funds YouTube channels.",
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
