"use client";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Network,
  Inbox,
  Library,
  History,
  Users,
  Search,
  Flag,
  Bug,
  LogOut,
  ArrowUpRight,
  Coffee,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
  SidebarInset,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./theme-provider";
import { PageMotion } from "./page-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
};
export function AppShell({
  children,
  variant,
  role,
}: {
  children: React.ReactNode;
  variant: "public" | "workspace";
  role?: "moderator" | "admin";
}) {
  return (
    <SidebarProvider
      defaultOpen={variant === "workspace"}
      desktopCollapsible={false}
      style={
        {
          "--sidebar-width": "216px",
          "--sidebar-width-icon": "64px",
        } as React.CSSProperties
      }
      className={`app-shell flex-col${variant === "workspace" ? " workspace-shell" : ""}`}
    >
      <ShellContent variant={variant} role={role}>
        {children}
      </ShellContent>
    </SidebarProvider>
  );
}
function ShellContent({
  children,
  variant,
  role,
}: {
  children: React.ReactNode;
  variant: "public" | "workspace";
  role?: "moderator" | "admin";
}) {
  const [signingOut, setSigningOut] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const supportCancelRef = useRef<HTMLButtonElement>(null);
  const { state, isMobile } = useSidebar();
  const workspace = variant === "workspace";
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await apiFetch("/api/auth/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      // Reset the entire client router/Activity cache after the session changes.
      window.location.replace("/moderator/sign-in");
    } catch {
      toast.error("Could not sign out. Try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className={`app-header flex shrink-0 items-center gap-3 px-4 md:px-6${workspace ? "" : " public-header"}`}>
        <SidebarTrigger className="md:hidden" />
        <Link
          href={workspace ? "/moderator" : "/"}
          className="flex shrink-0 items-center gap-2 font-bold tracking-tight"
        >
          <Image src="/brand-mark.svg" unoptimized width={32} height={32} alt="" aria-hidden="true" className="brand-mark" />
          YT Equity
        </Link>
        {workspace ? (
          <span className="ml-2 hidden text-xs text-muted-foreground sm:block">
            Workspace
          </span>
        ) : (
          <Suspense
            fallback={
              <div className="public-search mx-auto min-w-0 w-full max-w-xl">
                <Input
                  aria-label="Search channels or firms"
                  placeholder="Search channels or firms"
                  className="h-10 rounded-full bg-card"
                />
              </div>
            }
          >
            <PublicSearch />
          </Suspense>
        )}
        <div
          data-header-actions
          className={`flex shrink-0 items-center gap-2 ${workspace ? "ml-auto" : "ml-auto sm:ml-0"}`}
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Keep lights on"
                className="size-9 shrink-0 p-0 text-muted-foreground"
              >
                <Coffee aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <DialogContent
              className="sm:max-w-md"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                supportCancelRef.current?.focus();
              }}
            >
              <div
                className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-hidden="true"
              >
                <Coffee className="size-6" />
              </div>
              <DialogHeader className="text-center sm:text-center">
                <DialogTitle>Keep lights on</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3">
                    <p>Your support helps me keep YT Equity going. Thank you!</p>
                    <p>
                      Opens my YouTube video in a new tab, where you can leave a
                      one-time tip with Super Thanks.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="sm:justify-center">
                <DialogClose asChild>
                  <Button ref={supportCancelRef} type="button" variant="outline">
                    Maybe later
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button asChild>
                    <a
                      href="https://www.youtube.com/watch?v=WNGNhItoRh8#yt-equity-thanks"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Continue
                    </a>
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ThemeToggle compact={workspace} />
        </div>
      </header>
      <div
        className="app-body flex min-h-0 w-full flex-1"
        style={
          {
            "--nav-clearance": isMobile
              ? "0px"
              : !workspace || state === "collapsed"
                ? "80px"
                : "216px",
          } as React.CSSProperties
        }
      >
        <Sidebar
          collapsible="icon"
          className={
            workspace
              ? "workspace-sidebar"
              : "floating-sidebar public-navigation-rail"
          }
          variant={workspace ? "sidebar" : "floating"}
        >
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {workspace ? (
                  <Suspense fallback={null}>
                    <WorkspaceNavigation role={role} />
                  </Suspense>
                ) : (
                  <Suspense fallback={<NavItems links={publicLinks} />}>
                    <PublicNavigation />
                  </Suspense>
                )}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          {workspace && (
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Public explorer">
                    <Link href="/">
                      <ArrowUpRight />
                      <span>Public explorer</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={signOut}
                    disabled={signingOut}
                    tooltip="Sign out"
                  >
                    <LogOut />
                    <span>Sign out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          )}
        </Sidebar>
        <SidebarInset ref={contentRef} className="min-w-0 bg-transparent">
          <PageMotion target={contentRef} />
          {children}
        </SidebarInset>
      </div>
    </>
  );
}
const publicLinks: NavLink[] = [
  { href: "/", label: "Explore", icon: Network, active: false },
  { href: "/report/channel", label: "Report a channel", icon: Flag, active: false },
  { href: "/report", label: "Report an issue", icon: Bug, active: false },
  { href: "/privacy", label: "Extension privacy", icon: ShieldCheck, active: false },
];
function PublicNavigation() {
  const path = usePathname();
  return (
    <NavItems
      links={publicLinks.map((link) => ({
        ...link,
        active:
          link.href === "/"
            ? path === "/" ||
              path.startsWith("/channels") ||
              path.startsWith("/firms")
            : path === link.href,
      }))}
    />
  );
}
function WorkspaceNavigation({ role }: { role?: "moderator" | "admin" }) {
  const path = usePathname(),
    params = useSearchParams();
  const panel = params.get("panel") ?? "inbox";
  const links: NavLink[] = [
    {
      href: "/moderator?panel=inbox",
      label: "Inbox",
      icon: Inbox,
      active:
        path === "/moderator" &&
        panel === "inbox",
    },
    {
      href: "/moderator?panel=directory",
      label: "Directory",
      icon: Library,
      active:
        path === "/moderator" &&
        panel === "directory",
    },
    {
      href: "/moderator?panel=activity",
      label: "Activity",
      icon: History,
      active: path === "/moderator" && panel === "activity",
    },
    ...(role === "admin"
      ? [
          {
            href: "/admin",
            label: "Moderators",
            icon: Users,
            active: path === "/admin",
          },
        ]
      : []),
  ];
  return <NavItems links={links} currentPath={path} />;
}
function NavItems({
  links,
  currentPath,
}: {
  links: NavLink[];
  currentPath?: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <>
      {links.map(({ href, label, icon: Icon, active }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            asChild
            tooltip={label}
            isActive={active}
            size="lg"
          >
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              prefetch={currentPath ? false : undefined}
              onClick={() => {
                setOpenMobile(false);
              }}
            >
              <Icon />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </>
  );
}
function PublicSearch() {
  const path = usePathname(),
    params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current)
      setSearch(params.get("q") ?? "");
  }, [params]);
  useEffect(() => {
    const restore = () =>
      setSearch(new URLSearchParams(window.location.search).get("q") ?? "");
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const clear = () => setSearch("");
    window.addEventListener("atlas-search-clear", clear);
    return () => window.removeEventListener("atlas-search-clear", clear);
  }, []);
  function updateGraphSearch(value: string) {
    const next = new URLSearchParams(window.location.search);
    value.trim() ? next.set("q", value) : next.delete("q");
    window.history.replaceState(
      null,
      "",
      "/" + (next.size ? "?" + next.toString() : ""),
    );
  }
  return (
    <form
      action="/"
      onSubmit={(event) => {
        if (path === "/") {
          event.preventDefault();
          updateGraphSearch(search);
          window.dispatchEvent(new Event("atlas-search-submit"));
        }
      }}
      role="search"
      className="public-search relative mx-auto min-w-0 w-full max-w-xl"
    >
      <Search className="absolute left-4 top-3 size-4 text-muted-foreground" />
      <Input
        ref={input}
        name="q"
        maxLength={120}
        type="search"
        aria-label="Search channels or firms"
        placeholder="Search channels or firms"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (path === "/") updateGraphSearch(e.target.value);
        }}
        className="h-10 rounded-full bg-card pl-10 shadow-none"
      />
    </form>
  );
}
