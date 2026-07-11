import { useEffect, useRef, useCallback } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { Journey } from '#/db/schema'
import { useShell } from './AppShell'
import ThemeToggle from '../ThemeToggle'
import { X, Compass } from 'lucide-react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface DrawerNavProps {
  currentJourney?: Journey | null
}

/**
 * Slide-from-left drawer overlay (mobile navigation, < 768 px).
 * Always rendered in the DOM (visibility controlled by CSS class) so
 * the `prefers-reduced-motion` test can assert computed transition styles.
 *
 * Accessibility:
 * - role="dialog" + aria-modal="true"
 * - Focus is trapped while open (Tab / Shift+Tab cycle within drawer)
 * - Escape key closes the drawer and returns focus to the hamburger button
 * - Backdrop click closes the drawer
 */
export function DrawerNav({ currentJourney = null }: DrawerNavProps) {
  const { drawerOpen, closeDrawer } = useShell()
  const drawerRef    = useRef<HTMLDivElement>(null)
  const backdropRef  = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<Element | null>(null)

  const routerState = useRouterState()
  const pathname    = routerState.location.pathname

  // On open: store previous focus and move into drawer
  useEffect(() => {
    if (drawerOpen) {
      previousFocus.current = document.activeElement
      const first = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
      first?.focus()
    } else {
      // On close: return focus to previous element
      const prev = previousFocus.current
      if (prev instanceof HTMLElement) {
        prev.focus()
      }
      previousFocus.current = null
    }
  }, [drawerOpen])

  // Focus trap + Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!drawerOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [drawerOpen, closeDrawer],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  // Close on navigation (route change)
  useEffect(() => {
    closeDrawer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`wp-drawer-backdrop md:hidden ${drawerOpen ? '' : 'hidden'}`}
        aria-hidden="true"
        onClick={closeDrawer}
      />

      {/* Drawer panel — always in DOM for reduced-motion assertion */}
      <div
        id="wp-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`wp-drawer md:hidden ${drawerOpen ? '' : 'hidden'}`}
        data-testid="drawer-nav"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
            <Compass size={18} className="text-[var(--ember)]" aria-hidden="true" />
            Waypoint
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="btn-base btn-ghost btn-sm -mr-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Mobile navigation">
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

          {currentJourney && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-widest text-[var(--ink-faint)]">
                Current journey
              </p>
              <p className="px-2 text-sm font-semibold text-[var(--ink)] display-title">
                {currentJourney.title}
              </p>
            </div>
          )}
        </nav>

        {/* Theme toggle at bottom of drawer */}
        <div className="border-t border-[var(--border)] p-4">
          <ThemeToggle className="w-full justify-center" />
        </div>
      </div>
    </>
  )
}
