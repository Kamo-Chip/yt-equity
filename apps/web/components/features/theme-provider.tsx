"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <ThemeToaster />
    </NextThemesProvider>
  );
}
function ThemeToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionActive = useRef(false);
  useEffect(() => setMounted(true), []);
  const nextTheme = mounted && resolvedTheme === "dark" ? "light" : "dark";
  const label = `Switch to ${nextTheme} mode`;
  async function toggleTheme(event: MouseEvent<HTMLButtonElement>) {
    if (transitionActive.current) return;
    const root = document.documentElement;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const feather = Math.min(56, Math.max(24, Math.min(window.innerWidth, window.innerHeight) * 0.06));
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );
    flushSync(() => setTooltipOpen(false));
    if (
      !document.startViewTransition ||
      typeof CSS.registerProperty !== "function" ||
      !CSS.supports("mask-image", "radial-gradient(circle, black, transparent)") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setTheme(nextTheme);
      return;
    }

    transitionActive.current = true;
    setTransitioning(true);
    root.setAttribute("data-theme-transition", "");
    let transition: ReturnType<typeof document.startViewTransition> | undefined;
    let animation: Animation | undefined;
    try {
      transition = document.startViewTransition(() => {
        // next-themes applies the root class in an effect. Flush that commit
        // before the browser captures the new theme's snapshot.
        flushSync(() => setTheme(nextTheme));
      });
      await transition.ready;
      animation = root.animate(
        {
          "--theme-reveal-radius": ["0px", `${radius + feather}px`],
          "--theme-reveal-x": [`${x}px`, `${x}px`],
          "--theme-reveal-y": [`${y}px`, `${y}px`],
          "--theme-reveal-feather": [`${feather}px`, `${feather}px`],
        },
        {
          duration: 800,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      );
      await animation.finished;
      await transition.finished;
    } catch {
      transition?.skipTransition();
      setTheme(nextTheme);
      await transition?.finished.catch(() => {});
    } finally {
      animation?.cancel();
      root.removeAttribute("data-theme-transition");
      transitionActive.current = false;
      setTransitioning(false);
    }
  }
  return (
    <Tooltip
      open={tooltipOpen}
      onOpenChange={(open) => setTooltipOpen(open && !transitionActive.current)}
    >
      <TooltipTrigger asChild>
        <Button
          type="button"
          className={compact ? "workspace-theme-toggle size-9 rounded-lg border border-input bg-background shadow-none hover:bg-muted focus-visible:ring-2" : undefined}
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-busy={transitioning}
          disabled={!mounted}
          onClick={toggleTheme}
        >
          <span className="theme-toggle-icon grid size-4 shrink-0 place-items-center" aria-hidden="true">
            <Moon className="size-4 fill-sky-200 text-sky-500 dark:hidden" />
            <Sun className="hidden size-4 fill-yellow-400 text-yellow-400 dark:block" />
          </span>
        </Button>
      </TooltipTrigger>
      {tooltipOpen && <TooltipContent side="bottom" align="end">{label}</TooltipContent>}
    </Tooltip>
  );
}
