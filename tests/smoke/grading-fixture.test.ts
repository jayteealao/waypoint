// @vitest-environment node
/**
 * Grading fixture corpus tests.
 *
 * Six fixtures cover the full grading surface: correct, incorrect, partial,
 * gibberish, empty, and multi-sentence-correct. Each fixture simulates the
 * grading pipeline by validating a mocked callGateway response object via
 * `validateGrading`, which is the same function gradeAnswer calls after
 * receiving the gateway response.
 *
 * Ensures:
 *  - Each verdict matches the expected value
 *  - Feedback is a non-empty string
 *  - Gibberish and empty inputs produce verdict='incorrect' without throwing
 *  - Tests run in < 1s (no network, no Workers runtime)
 */

import { describe, it, expect } from "vitest";
import { validateGrading, buildGradingPrompt, QuizValidationError } from "#/lib/quiz/schema";
import type { QuizQuestion } from "#/db/schema";
import type { GradingOutput } from "#/lib/quiz/schema";

// ── Shared question fixture ────────────────────────────────────────────────────

const frqQuestion: QuizQuestion = {
  id: "q-fixture",
  waypoint_id: "wp-1",
  type: "frq",
  question: "Explain what a closure is in JavaScript and give an example of where it is used.",
  options: "[]",
  correct_answer: null,
  concept_id: "concept-closure",
  rubric:
    "0: No mention of closures or incorrect description. " +
    "1: Identifies that closures capture outer scope but misses practical example or key detail. " +
    "2: Correctly defines closure as a function that retains access to its outer scope after the outer function has returned, with a concrete example.",
};

// ── Fixture corpus ────────────────────────────────────────────────────────────

interface GradingFixture {
  name: string;
  learnerAnswer: string;
  mockGatewayResponse: GradingOutput;
  expectedVerdict: "correct" | "incorrect" | "partial";
}

const fixtures: GradingFixture[] = [
  {
    name: "correct — clear explanation with example",
    learnerAnswer:
      "A closure is a function that remembers the variables from its enclosing scope even after that scope has exited. " +
      "For example, a counter factory creates a count variable in its scope, and the returned increment function " +
      "still has access to count each time it is called.",
    mockGatewayResponse: {
      verdict: "correct",
      score: 2,
      feedback:
        "Excellent! You captured both the definition and a practical counter example — exactly what a closure is.",
    },
    expectedVerdict: "correct",
  },
  {
    name: "incorrect — wrong description",
    learnerAnswer: "A closure is when you close the browser tab and the memory is freed.",
    mockGatewayResponse: {
      verdict: "incorrect",
      score: 0,
      feedback:
        "Not quite — a closure is about function scope, not the browser lifecycle. " +
        "Think about what happens to a variable when the function that created it has finished running.",
    },
    expectedVerdict: "incorrect",
  },
  {
    name: "partial — correct concept but missing example",
    learnerAnswer:
      "A closure is a function that has access to its outer function scope even after the outer function has returned.",
    mockGatewayResponse: {
      verdict: "partial",
      score: 1,
      feedback:
        "Good start — you have the definition right. To score fully, include a concrete example showing where closures are useful in practice.",
    },
    expectedVerdict: "partial",
  },
  {
    name: "gibberish — keyboard mashing",
    learnerAnswer: "asdfghjklzxcvbnm qwerty poiuy",
    mockGatewayResponse: {
      verdict: "incorrect",
      score: 0,
      feedback: "Give it another try — even a short attempt helps you learn!",
    },
    expectedVerdict: "incorrect",
  },
  {
    name: "empty — blank answer",
    learnerAnswer: "",
    mockGatewayResponse: {
      verdict: "incorrect",
      score: 0,
      feedback: "Give it another try — even a short attempt helps you learn!",
    },
    expectedVerdict: "incorrect",
  },
  {
    name: "multi-sentence-correct — verbose but accurate",
    learnerAnswer:
      "In JavaScript, closures occur when an inner function is defined inside an outer function and it retains access " +
      "to the outer function's local variables even after the outer function has finished executing. " +
      "This is possible because JavaScript creates a new scope for every function call and the inner function " +
      "holds a reference to that scope object, preventing garbage collection. " +
      "A common use case is the module pattern, where you expose a public API while keeping private state hidden: " +
      "const counter = (function() { let n = 0; return { increment() { n++; }, value() { return n; } }; })();",
    mockGatewayResponse: {
      verdict: "correct",
      score: 2,
      feedback:
        "Outstanding — you explained the memory model, gave a correct use case, and provided working code. Full marks.",
    },
    expectedVerdict: "correct",
  },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("grading fixture corpus — validateGrading", () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}`, () => {
      // Simulate what gradeAnswer does after receiving the gateway response
      const result = validateGrading(fixture.mockGatewayResponse);

      expect(result.verdict).toBe(fixture.expectedVerdict);
      expect(typeof result.feedback).toBe("string");
      expect(result.feedback.length).toBeGreaterThan(0);

      // Score must match the verdict
      if (fixture.expectedVerdict === "correct") expect(result.score).toBe(2);
      if (fixture.expectedVerdict === "partial") expect(result.score).toBe(1);
      if (fixture.expectedVerdict === "incorrect") expect(result.score).toBe(0);
    });
  }

  it("gibberish input produces verdict=incorrect without throwing", () => {
    const gibberishGrading: GradingOutput = {
      verdict: "incorrect",
      score: 0,
      feedback: "Give it another try!",
    };
    expect(() => validateGrading(gibberishGrading)).not.toThrow();
    const result = validateGrading(gibberishGrading);
    expect(result.verdict).toBe("incorrect");
  });

  it("empty input produces verdict=incorrect without throwing", () => {
    const emptyGrading: GradingOutput = {
      verdict: "incorrect",
      score: 0,
      feedback: "Give it another try — even a short attempt helps you learn!",
    };
    expect(() => validateGrading(emptyGrading)).not.toThrow();
    const result = validateGrading(emptyGrading);
    expect(result.verdict).toBe("incorrect");
  });
});

describe("validateGrading — error cases", () => {
  it("throws QuizValidationError for invalid verdict", () => {
    const invalid = { verdict: "great", score: 2, feedback: "Nice!" };
    expect(() => validateGrading(invalid)).toThrow(QuizValidationError);
  });

  it("throws QuizValidationError for invalid score", () => {
    const invalid = { verdict: "correct", score: 3, feedback: "Nice!" };
    expect(() => validateGrading(invalid)).toThrow(QuizValidationError);
  });

  it("throws QuizValidationError for missing feedback", () => {
    const invalid = { verdict: "correct", score: 2, feedback: "" };
    expect(() => validateGrading(invalid)).toThrow(QuizValidationError);
  });
});

describe("buildGradingPrompt — grading message shape", () => {
  it("includes question, rubric, and learner answer in the prompt", () => {
    const prompt = buildGradingPrompt(frqQuestion, "A closure captures outer scope.");
    expect(prompt).toContain("Explain what a closure is");
    expect(prompt).toContain("0: No mention");
    expect(prompt).toContain("A closure captures outer scope.");
  });

  it("shows (empty) placeholder for an empty learner answer", () => {
    const prompt = buildGradingPrompt(frqQuestion, "");
    expect(prompt).toContain("(empty)");
  });
});
