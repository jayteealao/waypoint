import { createContext, useCallback, useContext, useState } from "react";
import type { Journey } from "#/db/schema";
import { Sidebar } from "./Sidebar";
import { DrawerNav } from "./DrawerNav";
import ThemeToggle from "../ThemeToggle";
import { Menu } from "lucide-react";

/* ─── Shell context ──────────────────────────────────────────────────── */

/** A waypoint entry displayed in the Sidebar and DrawerNav navigation lists. */
export interface ShellWaypoint {
  id: string;
  label: string;
  href: string;
  completed: boolean;
}

interface ShellContextValue {
  drawerOpen: boolean;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  waypoints: ShellWaypoint[];
  setWaypoints: (ws: ShellWaypoint[]) => void;
}

export const ShellContext = createContext<ShellContextValue>({
  drawerOpen: false,
  toggleDrawer: () => {},
  closeDrawer: () => {},
  waypoints: [],
  setWaypoints: () => {},
});

export function useShell() {
  return useContext(ShellContext);
}

/* ─── AppShell ───────────────────────────────────────────────────────── */

export interface AppShellProps {
  children: React.ReactNode;
  currentJourney?: Journey | null;
}

/**
 * Root layout wrapper for authenticated routes.
 *
 * Desktop (≥768px): sidebar (240px sticky) + scrollable content pane.
 * Mobile (<768px):  no sidebar; sticky topbar with hamburger opens DrawerNav.
 *
 * Theme toggle lives in the sidebar header (desktop) and the mobile topbar (mobile).
 * The drawer holds the same navigation as the sidebar.
 */
export function AppShell({ children, currentJourney = null }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [waypoints, setWaypoints] = useState<ShellWaypoint[]>([]);

  const toggleDrawer = useCallback(() => setDrawerOpen((prev) => !prev), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <ShellContext.Provider
      value={{ drawerOpen, toggleDrawer, closeDrawer, waypoints, setWaypoints }}
    >
      <div className="wp-shell">
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex">
          <Sidebar currentJourney={currentJourney} />
        </div>

        {/* Main content area */}
        <div className="wp-shell-content flex flex-col">
          {/* Mobile top bar — hidden on md+ */}
          <header className="wp-mobile-topbar md:hidden" role="banner">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="wp-drawer"
              onClick={toggleDrawer}
              className="btn-base btn-ghost btn-sm -ml-2"
            >
              <Menu size={20} aria-hidden="true" />
            </button>

            <span className="flex-1 text-sm font-semibold text-[var(--ink)] truncate">
              Waypoint
            </span>

            <ThemeToggle />
          </header>

          {/* Journey progress bar — mobile, 4px ember strip */}
          <div className="wp-mobile-progress md:hidden" aria-hidden="true">
            <div
              className="wp-mobile-progress-fill"
              style={{ width: "0%" /* populated by later slices */ }}
            />
          </div>

          {/* Page content */}
          <main className="flex-1">{children}</main>
        </div>

        {/* Drawer nav — mobile overlay */}
        <DrawerNav currentJourney={currentJourney} />
      </div>
    </ShellContext.Provider>
  );
}
