import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { JourneyCard } from "./JourneyCard";
import type { Journey } from "#/db/schema";

// Regression guard for the fix-continue-button slice: the journey card's
// "Continue" control was a dead <Button> with no handler/link. It must now be a
// real anchor that navigates to the journey overview (/journey/$journeyId/progress)
// — or, when the journey has no roadmap yet (abandoned mid-interview, IF-1),
// resumes the interview (/journey/$journeyId/interview) instead of landing on an
// empty progress shell with no way back.
//
// Evidence rung: headless (real component + real TanStack Router in jsdom,
// memory history). Drives the actual click → navigation, not a mock.

const journey: Journey = {
  id: "jrny_123",
  user_id: "user_1",
  title: "Learn Rust",
  goal: "Ship a CLI in Rust",
  status: "active",
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_000_000,
};

/** Build a minimal router that mounts JourneyCard at "/" and exposes both
 *  destinations the Continue link can target: the progress overview
 *  (roadmap present) and the interview (roadmap not generated yet, IF-1). */
function renderInRouter(hasRoadmap: boolean) {
  const rootRoute = createRootRoute({
    component: () => React.createElement(Outlet),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => React.createElement(JourneyCard, { journey, hasRoadmap }),
  });
  const progressRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/journey/$journeyId/progress",
    component: () => React.createElement("div", { "data-testid": "progress-page" }, "Progress"),
  });
  const interviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/journey/$journeyId/interview",
    component: () => React.createElement("div", { "data-testid": "interview-page" }, "Interview"),
  });
  const routeTree = rootRoute.addChildren([indexRoute, progressRoute, interviewRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(React.createElement(RouterProvider, { router } as any));
  return router;
}

describe("JourneyCard — Continue control", () => {
  it("renders Continue as a real link to the journey overview when a roadmap exists", async () => {
    renderInRouter(true);

    const link = await screen.findByRole("link", { name: `Continue ${journey.title}` });

    // AC-2: it is a real anchor (keyboard-focusable, ⌘-clickable), not a <button>.
    expect(link.tagName).toBe("A");
    // AC-1: href targets the journey overview with the card's journey id.
    expect(link.getAttribute("href")).toBe(`/journey/${journey.id}/progress`);
    // AC-3 (structural): keeps the secondary-button styling classes.
    expect(link).toHaveClass("btn-base", "btn-secondary", "btn-sm");
  });

  it("navigates to the journey overview when Continue is clicked and a roadmap exists", async () => {
    const router = renderInRouter(true);

    const link = await screen.findByRole("link", { name: `Continue ${journey.title}` });
    fireEvent.click(link);

    // AC-1: clicking Continue lands on /journey/<id>/progress.
    expect(await screen.findByTestId("progress-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/journey/${journey.id}/progress`);
  });

  it("targets the interview (not progress) when the journey has no roadmap yet", async () => {
    renderInRouter(false);

    const link = await screen.findByRole("link", { name: `Continue ${journey.title}` });

    // IF-1: an abandoned mid-interview journey has zero waypoints, so Continue
    // must resume the interview instead of landing on an empty progress shell.
    expect(link.getAttribute("href")).toBe(`/journey/${journey.id}/interview`);
    expect(link).toHaveClass("btn-base", "btn-secondary", "btn-sm");
  });

  it("navigates to the interview when Continue is clicked and no roadmap exists", async () => {
    const router = renderInRouter(false);

    const link = await screen.findByRole("link", { name: `Continue ${journey.title}` });
    fireEvent.click(link);

    expect(await screen.findByTestId("interview-page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/journey/${journey.id}/interview`);
  });
});
