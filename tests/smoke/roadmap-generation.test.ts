/**
 * Unit tests for roadmap schema validation and NDJSON line-buffer parser.
 *
 * Roadmap: validateRoadmap, buildRoadmapPrompt from src/lib/roadmap/schema.ts
 * NDJSON: inline tests of the line-accumulator logic (same code as SSE route).
 *
 * No network, no D1, no Workers runtime required — pure unit tests.
 */

import { describe, expect, it } from "vitest";
import { validateRoadmap, buildRoadmapPrompt, GenerationError } from "#/lib/roadmap/schema";
import type { CapturedRecord } from "#/types/interview";

// ── validateRoadmap ────────────────────────────────────────────────────────────

describe("validateRoadmap", () => {
  const validWaypoint = {
    title: "Understand Async/Await",
    goal: "Write non-blocking async functions",
    concepts: ["Async/Await", "Promises"],
  };

  it("accepts a valid 5-waypoint roadmap", () => {
    const input = Array.from({ length: 5 }, (_, i) => ({
      ...validWaypoint,
      title: `Waypoint ${i + 1}`,
    }));
    const result = validateRoadmap(input);
    expect(result).toHaveLength(5);
    expect(result[0]?.title).toBe("Waypoint 1");
  });

  it("accepts a valid 8-waypoint roadmap", () => {
    const input = Array.from({ length: 8 }, (_, i) => ({
      ...validWaypoint,
      title: `Waypoint ${i + 1}`,
      concepts: [`Concept${i}`, `Concept${i + 1}`],
    }));
    const result = validateRoadmap(input);
    expect(result).toHaveLength(8);
  });

  it("rejects a non-array value", () => {
    expect(() => validateRoadmap({ title: "not an array" })).toThrow(GenerationError);
    expect(() => validateRoadmap("string")).toThrow(GenerationError);
    expect(() => validateRoadmap(null)).toThrow(GenerationError);
  });

  it("rejects an empty array", () => {
    expect(() => validateRoadmap([])).toThrow(GenerationError);
  });

  it("rejects an array with more than 20 items", () => {
    const input = Array.from({ length: 21 }, (_, i) => ({ ...validWaypoint, title: `WP${i}` }));
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("rejects a waypoint missing title", () => {
    const input = [{ goal: "do X", concepts: ["C1"] }];
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("rejects a waypoint with empty title string", () => {
    const input = [{ title: "   ", goal: "do X", concepts: ["C1"] }];
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("rejects a waypoint missing goal", () => {
    const input = [{ title: "T", concepts: ["C1"] }];
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("rejects a waypoint with missing concepts array", () => {
    const input = [{ title: "T", goal: "G", concepts: [] }];
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("rejects a waypoint with non-string concepts", () => {
    const input = [{ title: "T", goal: "G", concepts: [42, "OK"] }];
    expect(() => validateRoadmap(input)).toThrow(GenerationError);
  });

  it("accepts extra fields on waypoints (additive compat)", () => {
    const input = [{ ...validWaypoint, extra_field: true, position: 0 }];
    const result = validateRoadmap(input);
    expect(result).toHaveLength(1);
  });
});

// ── buildRoadmapPrompt ─────────────────────────────────────────────────────────

describe("buildRoadmapPrompt", () => {
  it("includes mission when present", () => {
    const capture: CapturedRecord = {
      mission: "Build a REST API to launch my SaaS",
      scope: "beginner",
      priorKnowledge: "JavaScript basics",
      sourceUrls: [],
      bestEffort: false,
    };
    const prompt = buildRoadmapPrompt(capture);
    expect(prompt).toContain("Build a REST API to launch my SaaS");
    expect(prompt).toContain("beginner");
    expect(prompt).toContain("JavaScript basics");
  });

  it("handles null mission gracefully", () => {
    const capture: CapturedRecord = {
      mission: null,
      scope: null,
      priorKnowledge: null,
      sourceUrls: [],
      bestEffort: true,
    };
    const prompt = buildRoadmapPrompt(capture);
    expect(prompt).toContain("Not captured");
    expect(prompt).toContain("best roadmap from the available information");
  });

  it("includes source URLs when provided", () => {
    const capture: CapturedRecord = {
      mission: "M",
      scope: "intermediate",
      priorKnowledge: null,
      sourceUrls: ["https://example.com/docs", "https://other.com"],
      bestEffort: false,
    };
    const prompt = buildRoadmapPrompt(capture);
    expect(prompt).toContain("https://example.com/docs");
    expect(prompt).toContain("https://other.com");
  });
});

// ── NDJSON line-buffer logic ───────────────────────────────────────────────────

/**
 * Inline implementation of the SSE route's line-buffer accumulator.
 * Tests the core parsing logic without spinning up a Worker or running I/O.
 */
function processNdjsonChunks(chunks: string[]): unknown[] {
  const parsed: unknown[] = [];
  let lineBuffer = "";

  for (const chunk of chunks) {
    lineBuffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = lineBuffer.indexOf("\n")) !== -1) {
      const line = lineBuffer.slice(0, newlineIndex).trim();
      lineBuffer = lineBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      if (line.startsWith("```") || line.startsWith("---")) continue;
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // skip non-JSON
      }
    }
  }

  return parsed;
}

describe("NDJSON line-buffer accumulator", () => {
  it("parses complete NDJSON lines in a single chunk", () => {
    const chunk =
      '{"type":"header","title":"T","summary":"S"}\n{"type":"prose","id":"p1","html":"<p>hi</p>","concept_tags":["Async"]}\n';
    const result = processNdjsonChunks([chunk]);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>)["type"]).toBe("header");
    expect((result[1] as Record<string, unknown>)["type"]).toBe("prose");
  });

  it("handles split chunks where one line is split across two calls", () => {
    const part1 = '{"type":"header","title":"T",';
    const part2 = '"summary":"S"}\n';
    const result = processNdjsonChunks([part1, part2]);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>)["title"]).toBe("T");
  });

  it("handles three chunks with line boundary in the middle", () => {
    const part1 = '{"type":"prose","id":"p1","html":';
    const part2 = '"<p>content</p>","concept_tags":["Con';
    const part3 = 'cept1"]}\n';
    const result = processNdjsonChunks([part1, part2, part3]);
    expect(result).toHaveLength(1);
    const section = result[0] as Record<string, unknown>;
    expect(section["type"]).toBe("prose");
    expect((section["concept_tags"] as string[]).includes("Concept1")).toBe(true);
  });

  it("skips non-JSON lines gracefully (R2 risk)", () => {
    const chunk =
      'Some prose the model emitted by mistake\n{"type":"heading","id":"h1","level":2,"text":"Section"}\n';
    const result = processNdjsonChunks([chunk]);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>)["type"]).toBe("heading");
  });

  it("skips markdown fence lines", () => {
    const chunk = '```json\n{"type":"prose","id":"p1","html":"<p>x</p>","concept_tags":[]}\n```\n';
    const result = processNdjsonChunks([chunk]);
    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>)["type"]).toBe("prose");
  });

  it("concept_tags field passes through correctly in section NDJSON", () => {
    const line =
      '{"type":"widget","id":"w1","widget_type":"checkpoint-question","props":{"question":"Q?","options":["A","B","C","D"],"correct_index":0,"explanation":"E"},"concept_tags":["Async/Await","Promises"]}\n';
    const result = processNdjsonChunks([line]);
    expect(result).toHaveLength(1);
    const w = result[0] as Record<string, unknown>;
    expect(w["concept_tags"]).toEqual(["Async/Await", "Promises"]);
  });

  it("produces an empty array when all lines are malformed", () => {
    const chunk = "not json\nalso not json\n{broken\n";
    const result = processNdjsonChunks([chunk]);
    expect(result).toHaveLength(0);
  });
});
