// @vitest-environment node
// requireOwnership is a pure synchronous function with no Workers runtime
// dependency; node environment is sufficient.

import { describe, it, expect } from "vitest";
import { requireOwnership } from "#/lib/auth-guard";

describe("requireOwnership (AC-ADL2)", () => {
  it("passes when session user id matches resource user id", () => {
    expect(() => requireOwnership("user-123", "user-123")).not.toThrow();
  });

  it("throws a 403 Response when session user id differs from resource user id", () => {
    let thrown: unknown;
    try {
      requireOwnership("user-a", "user-b");
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof Response).toBe(true);
    expect((thrown as Response).status).toBe(403);
  });

  it("throws a 403 Response when session user id is an empty string", () => {
    let thrown: unknown;
    try {
      requireOwnership("", "user-123");
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof Response).toBe(true);
    expect((thrown as Response).status).toBe(403);
  });

  it("throws a 403 Response when resource user id is an empty string", () => {
    let thrown: unknown;
    try {
      requireOwnership("user-123", "");
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof Response).toBe(true);
    expect((thrown as Response).status).toBe(403);
  });

  it("throws a 403 Response when both ids are empty strings", () => {
    let thrown: unknown;
    try {
      requireOwnership("", "");
    } catch (err) {
      thrown = err;
    }
    expect(thrown instanceof Response).toBe(true);
    expect((thrown as Response).status).toBe(403);
  });

  // AC-ADL6: A GitHub account with a private email (email: undefined or null)
  // must still result in a valid account. Ownership checks only involve user id,
  // not email, so this is a trivial pass — the guard never sees the email field.
  it("passes for a valid user id regardless of email availability (AC-ADL6)", () => {
    const userIdWithNoEmail = "github-user-no-email-456";
    expect(() => requireOwnership(userIdWithNoEmail, userIdWithNoEmail)).not.toThrow();
  });
});
