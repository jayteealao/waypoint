import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Minimal smoke test: verifies Vitest + jsdom + Testing Library are wired correctly.
// Does NOT exercise TanStack Router or server functions — those require a running server.
describe("Smoke: React renders in jsdom", () => {
  it("mounts a React component without throwing", () => {
    function SmokeComponent() {
      return React.createElement("div", { "data-testid": "smoke" }, "Waypoint");
    }

    render(React.createElement(SmokeComponent));
    expect(screen.getByTestId("smoke")).toBeInTheDocument();
    expect(screen.getByTestId("smoke")).toHaveTextContent("Waypoint");
  });
});
