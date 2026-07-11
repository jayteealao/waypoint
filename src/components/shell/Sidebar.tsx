import { Link, useRouterState } from '@tanstack/react-router'
import type { Journey } from '#/db/schema'
import { useShell } from './AppShell'
import { Meter } from '../ui/Meter'
import ThemeToggle from '../ThemeToggle'
import { Compass } from 'lucide-react'

export interface SidebarProps {
  currentJourney?: Journey | null
}

/**
 * Left navigation sidebar (desktop, 240px sticky).
 * Shows the Waypoint brand, journey context, waypoint list (from ShellContext),
 * and an overall progress meter at the bottom.
 */
export function Sidebar({ currentJourney = null }: SidebarProps) {
  const routerState      = useRouterState()
  const pathname         = routerState.location.pathname
  const { waypoints }    = useShell()

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

        {/* Journey context — shown for a real journey or when sample waypoints are active */}
        {(currentJourney || waypoints.length > 0) && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            {currentJourney && (
              <>
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)]">
                  Current journey
                </p>
                <p className="px-2 text-sm font-semibold text-[var(--ink)] display-title">
                  {currentJourney.title}
                </p>
              </>
            )}
            {waypoints.length > 0 && (
              <nav
                className="mt-3 space-y-0.5"
                aria-label="Journey waypoints"
              >
                {waypoints.map((wp) => (
                  <Link
                    key={wp.id}
                    to={wp.href}
                    data-waypoint={wp.id}
                    data-completed={wp.completed ? 'true' : 'false'}
                    className={`wp-sidebar-nav-item${pathname === wp.href ? ' wp-sidebar-nav-item--active' : ''}`}
                  >
                    <span className="flex-1 truncate">{wp.label}</span>
                    {wp.completed && (
                      <span
                        className="ml-1 text-[var(--success)]"
                        aria-label="Completed"
                      >
                        ✓
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            )}
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
