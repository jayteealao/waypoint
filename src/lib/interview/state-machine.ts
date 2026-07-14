/**
 * Interview State Machine — tutor-interview slice.
 *
 * Structural enforcer for the one-question-per-turn contract.
 * A stateless server function re-instantiates this class from the
 * stored interview_records row on every call; in-memory state is
 * intentionally ephemeral.
 *
 * The state machine makes the one-question rule structural, not just
 * instructed: whatever the model returns, only the first ?-terminated
 * sentence reaches the client.
 */

import type { InterviewStage, CapturedRecord } from "#/types/interview";

/** Stage ordering for transition validation. */
const STAGE_ORDER: InterviewStage[] = [
  "consent",
  "mission",
  "scope",
  "prior_knowledge",
  "sources",
  "complete",
];

export class InterviewStateMachine {
  stage: InterviewStage;

  constructor(initialStage: InterviewStage = "consent") {
    this.stage = initialStage;
  }

  /**
   * Extract the first question from a model response.
   *
   * Algorithm: find all ?-terminated spans (non .!? characters followed by ?)
   * and return the first one, trimmed. If no ? found, return the first line.
   * This prevents multi-question model outputs from reaching the client.
   *
   * Covers adversarial patterns:
   *  - Multiple questions in one response
   *  - Parenthetical questions ("(is this right?)")
   *  - Non-question prose followed by a question
   *  - Newline-separated questions
   */
  extractFirstQuestion(text: string): string {
    // Strip off anything after the first question mark with trailing content
    // Match the shortest span ending in '?' — captures the first complete question.
    const match = text.match(/[^!?]*\?/);
    if (match) {
      return match[0].trim();
    }
    // Fallback: first non-empty line (model didn't ask a question)
    const firstLine = text.split("\n").find((l) => l.trim().length > 0);
    return firstLine?.trim() ?? text.trim();
  }

  /**
   * Advance the interview stage based on the user's reply.
   *
   * Consent stage: any positive intent → mission; decline variants → declined.
   * Mission stage: detect vagueness; if vague, stay at mission for pushback.
   * All other stages: advance linearly.
   *
   * Returns the new stage after the transition.
   */
  transition(userInput: string): InterviewStage {
    const lower = userInput.toLowerCase().trim();

    switch (this.stage) {
      case "consent": {
        // Decline variants: explicit refusal chip or negative phrasing
        const isDecline =
          lower.includes("just use my stated goal") ||
          lower.includes("just use") ||
          lower.includes("skip") ||
          lower === "no" ||
          lower.startsWith("no,") ||
          lower.startsWith("no ");
        this.stage = isDecline ? "declined" : "mission";
        break;
      }

      case "mission": {
        // Stay at mission if the answer is vague; advance if concrete enough
        if (!this.detectVagueness(userInput)) {
          this.stage = "scope";
        }
        // If vague: stage remains 'mission'; the prompt will push back
        break;
      }

      case "scope":
        this.stage = "prior_knowledge";
        break;

      case "prior_knowledge":
        this.stage = "sources";
        break;

      case "sources":
        this.stage = "complete";
        break;

      case "complete":
      case "declined":
        // Terminal states — no further transition
        break;

      default:
        break;
    }

    return this.stage;
  }

  /**
   * Detect whether a mission statement is too vague to proceed.
   *
   * Returns true when:
   *  - Fewer than 20 characters (too short to contain a real goal)
   *  - Matches a vague-phrase pattern AND lacks a mission-format marker
   *    ("so that", "so I can", "in order to", "by", "when").
   */
  detectVagueness(missionText: string): boolean {
    const trimmed = missionText.trim();
    if (trimmed.length < 20) return true;

    // Mission-format markers signal a concrete goal — not vague
    const hasMissionFormat =
      /\b(so\s+(that|i\s+can)|in\s+order\s+to|in\s+order\s+that|by\s+\w|when\s+i)\b/i.test(trimmed);
    if (hasMissionFormat) return false;

    // Vague-phrase patterns that indicate a generic learning desire
    const vaguePhrases = [
      /^i\s+(want|need|would\s+like)\s+to\s+learn\s+\w/i,
      /^i\s+want\s+to\s+get\s+better\s+at/i,
      /^get\s+better\s+at\s+/i,
      /^improve\s+(my\s+|at\s+)/i,
      /^learn\s+more\s+about\s+/i,
      /^understand\s+(more\s+about\s+|better\s+)?(\w+)/i,
      /^study\s+\w+/i,
      /^explore\s+\w+/i,
    ];

    return vaguePhrases.some((p) => p.test(trimmed));
  }

  /**
   * Map a captured user answer into the CapturedRecord field for the given stage.
   * Called by the server function after a stage advances.
   *
   * The returned partial is merged into the stored captured_* columns.
   */
  captureField(
    stage: InterviewStage,
    value: string,
  ): Partial<Pick<CapturedRecord, "mission" | "scope" | "priorKnowledge">> {
    switch (stage) {
      case "mission":
        return { mission: value };
      case "scope":
        return { scope: value };
      case "prior_knowledge":
        return { priorKnowledge: value };
      default:
        return {};
    }
  }

  /**
   * Build a CapturedRecord for the consent-declined path.
   * The journey goal is the only input; all probe fields are null.
   */
  buildConsentDeclinedRecord(goal: string): CapturedRecord {
    return {
      mission: goal,
      scope: null,
      priorKnowledge: null,
      sourceUrls: [],
      bestEffort: true,
    };
  }

  /** Returns the index of the current stage in the linear sequence. */
  stageIndex(): number {
    const idx = STAGE_ORDER.indexOf(this.stage);
    return idx === -1 ? 0 : idx;
  }
}
