import { Link, useRouterState } from '@tanstack/react-router'
import type { Journey } from '#/db/schema'
import { Meter } from '../ui/Meter'
import ThemeToggle from '../ThemeToggle'
import { Compass } from 'lucide-react'

export interface SidebarProps {
  currentJourney?: Journey | null
}

/**
 * Left navigation sidebar (desktop, 240px sticky).
 * Shows the Waypoint brand, journey context, waypoint list seam (filled by later slices),
 * and an overall progress meter at the bottom.
 */
export function Sidebar({ currentJourney = null }: SidebarProps) {
  const routerState = useRouterState()
  const pathname    = routerState.location.pathname

  return (
    <aside
      className="wp-sidebar"
      data-testid="sidebar"
      aria-label="Application navigation"
    >
      {/* Brand / header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-bold text-[var(--ink)] no-underline"
          aria-label="Waypoint home"
        >
          <Compass size={18} className="text-[var(--ember)]" aria-hidden="true" />
          Waypoint
        </Link>
        <ThemeToggle className="text-xs px-2 py-1 min-h-0" />
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
        <Link
          to="/"
          className={`wp-sidebar-nav-item${pathname === '/' ? ' wp-sidebar-nav-item--active' : ''}`}
        >
          Journeys
        </Link>
        <Link
          to="/account"
          className={`wp-sidebar-nav-item${pathname === '/account' ? ' wp-sidebar-nav-item--active' : ''}`}
        >
          Account
        </Link>

        {/* Journey context — populated by later slices */}
        {currentJourney && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)]">
              Current journey
            </p>
            <p className="px-2 text-sm font-semibold text-[var(--ink)] display-title">
              {currentJourney.title}
            </p>
            {/* Waypoint list seam — lesson-renderer + roadmap-lesson-generation fill this */}
            <div
              className="mt-3 space-y-0.5"
              aria-label="Waypoints — coming soon"
            >
              <p className="px-2 text-xs text-[var(--ink-muted)] italic">
                Waypoints load when you open a lesson.
              </p>
            </div>
          </div>
        )}
      </nav>

      {/* Progress meter — bottom of sidebar */}
      <div className="border-t border-[var(--border)] p-4">
        <Meter
          value={0}
          label="Overall progress"
          showValue
          className="text-xs"
        />
      </div>
    </aside>
  )
}
