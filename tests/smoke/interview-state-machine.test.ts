/**
 * InterviewStateMachine unit tests — tutor-interview slice.
 *
 * Covers: AC-TI2 (detectVagueness structural contract) and
 * AC-TI5 (one-question structural enforcement via extractFirstQuestion).
 *
 * 14 tests total:
 *   - 6 adversarial multi-Q fixtures → extractFirstQuestion returns exactly one ?
 *   - 5 vague-mission inputs → detectVagueness returns true
 *   - 3 non-vague inputs → detectVagueness returns false
 *   - Full stage sequence consent→…→complete
 *   - Decline-consent → buildConsentDeclinedRecord shape
 */

import { describe, test, expect } from "vitest";
import { InterviewStateMachine } from "#/lib/interview/state-machine";

// ── extractFirstQuestion — adversarial fixtures ───────────────────────────

describe("extractFirstQuestion — one-question enforcement (AC-TI5)", () => {
  const sm = new InterviewStateMachine();

  test("returns only the first question when model gives two questions", () => {
    const text = "Welcome! What is your learning goal? And what level are you at?";
    const result = sm.extractFirstQuestion(text);
    expect((result.match(/\?/g) ?? []).length).toBe(1);
    expect(result).toContain("What is your learning goal");
  });

  test("returns first question when separated by newline", () => {
    const text = "Great goal!\nWhat specific outcomes do you want?\nWhat is your current level?";
    const result = sm.extractFirstQuestion(text);
    expect((result.match(/\?/g) ?? []).length).toBe(1);
  });

  test("handles parenthetical question before the main question", () => {
    const text = "That sounds good (is this right?) — so what have you tried before?";
    const result = sm.extractFirstQuestion(text);
    expect((result.match(/\?/g) ?? []).length).toBe(1);
  });

  test("handles non-question prose followed by a question", () => {
    const text =
      "Learning TypeScript is a great goal. I'd love to help you get there. What specific project do you want to build with it?";
    const result = sm.extractFirstQuestion(text);
    expect((result.match(/\?/g) ?? []).length).toBe(1);
    expect(result).toContain("project");
  });

  test("handles three questions in one model response", () => {
    const text = "What do you want to learn? How long have you studied? What is your goal?";
    const result = sm.extractFirstQuestion(text);
    expect((result.match(/\?/g) ?? []).length).toBe(1);
    expect(result.trim()).toBe("What do you want to learn?");
  });

  test("falls back to first line when no question mark present", () => {
    const text = "Welcome to Waypoint.\nI will guide you through your learning journey.";
    const result = sm.extractFirstQuestion(text);
    expect(result).toBe("Welcome to Waypoint.");
  });
});

// ── detectVagueness — mission validation ─────────────────────────────────

describe("detectVagueness (AC-TI2)", () => {
  const sm = new InterviewStateMachine();

  test("short answer is vague (< 20 chars)", () => {
    expect(sm.detectVagueness("learn Rust")).toBe(true);
  });

  test('generic "I want to learn X" is vague', () => {
    expect(sm.detectVagueness("I want to learn TypeScript programming")).toBe(true);
  });

  test('"get better at" pattern is vague', () => {
    expect(sm.detectVagueness("get better at writing Python code")).toBe(true);
  });

  test('"improve my" pattern is vague', () => {
    expect(sm.detectVagueness("improve my JavaScript skills and knowledge")).toBe(true);
  });

  test('"understand more about" is vague', () => {
    expect(sm.detectVagueness("understand more about machine learning concepts")).toBe(true);
  });

  test('mission with "so I can" is NOT vague', () => {
    expect(
      sm.detectVagueness(
        "I want to learn TypeScript so I can build a web app for my freelance work",
      ),
    ).toBe(false);
  });

  test('mission with "in order to" is NOT vague', () => {
    expect(
      sm.detectVagueness(
        "I want to learn Rust in order to contribute to open-source systems tools",
      ),
    ).toBe(false);
  });

  test("concrete goal description without vague phrases is NOT vague", () => {
    expect(
      sm.detectVagueness(
        "Build a production-ready REST API with authentication by the end of the month",
      ),
    ).toBe(false);
  });
});

// ── Stage sequence — full linear flow ────────────────────────────────────

describe("stage sequence consent→complete", () => {
  test("advances through all 5 stages to complete", () => {
    const sm = new InterviewStateMachine();

    expect(sm.stage).toBe("consent");
    sm.transition("Yes, let's explore");
    expect(sm.stage).toBe("mission");

    sm.transition("Build a CLI tool in Rust so I can replace my Python scripts by summer");
    expect(sm.stage).toBe("scope");

    sm.transition("Some experience");
    expect(sm.stage).toBe("prior_knowledge");

    sm.transition("A little");
    expect(sm.stage).toBe("sources");

    sm.transition("No preferred sources");
    expect(sm.stage).toBe("complete");
  });

  test("mission stays at mission stage when answer is vague", () => {
    const sm = new InterviewStateMachine("mission");
    sm.transition("I want to learn Rust");
    expect(sm.stage).toBe("mission");
  });
});

// ── Decline-consent path ─────────────────────────────────────────────────

describe("consent-decline path (AC-TI4)", () => {
  test('transitions to declined when user selects "Just use my stated goal"', () => {
    const sm = new InterviewStateMachine();
    sm.transition("Just use my stated goal");
    expect(sm.stage).toBe("declined");
  });

  test("buildConsentDeclinedRecord produces expected shape", () => {
    const sm = new InterviewStateMachine();
    const record = sm.buildConsentDeclinedRecord("I want to learn Rust");
    expect(record).toEqual({
      mission: "I want to learn Rust",
      scope: null,
      priorKnowledge: null,
      sourceUrls: [],
      bestEffort: true,
    });
  });
});
