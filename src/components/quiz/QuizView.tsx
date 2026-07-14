/**
 * QuizView — unified quiz component supporting two modes.
 *
 * MODE: 'sample'
 *   Single-question MC flow from fixtures. localStorage attempt persistence.
 *   Existing behavior preserved byte-for-byte (no regression to sample journey).
 *
 * MODE: 'journey'
 *   Server-backed quiz from D1 quiz_questions rows.
 *   Supports both MC (client-side grading via correct_answer text comparison)
 *   and FRQ (AI grading via gradeAnswer server function with grading-state UX).
 *   Calls recordAttemptAndUpdateFsrs after each question is answered.
 *   On quiz completion, calls the onComplete callback so the parent route can
 *   navigate away.
 *
 * Verification seams:
 *   data-testid="quiz-view"          — wrapper (always)
 *   data-testid="quiz-frq-input"     — FRQ textarea (journey mode)
 *   data-testid="quiz-grading-state" — "Checking your answer…" shown during await
 *   data-testid="quiz-grade-verdict" — verdict after grading
 *   data-testid="quiz-feedback"      — feedback shown for MC (same as before)
 *   data-testid="quiz-results"       — results screen
 *   data-testid="quiz-score"         — score display
 */

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import type { SampleQuizQuestion } from "#/fixtures/sample-journey";
import { SAMPLE_QUIZ_ATTEMPT_KEY } from "#/fixtures/sample-journey";
import type { QuizQuestion } from "#/db/schema";
import { gradeAnswer, recordAttemptAndUpdateFsrs } from "#/server/quiz";
import type { GradingOutput } from "#/lib/quiz/schema";

// ─── Local attempt tracking for results screen ────────────────────────────────

interface QuizAttempt {
  score: number; // 0–1 fraction
  answers: (number | null)[];
  completedAt: string; // ISO-8601
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SampleModeProps {
  mode: "sample";
  questions: SampleQuizQuestion[];
  onComplete?: () => void;
}

interface JourneyModeProps {
  mode: "journey";
  questions: QuizQuestion[];
  journeyId: string;
  waypointId: string;
  /** Called with the number of correctly-answered questions and the total count. */
  onComplete?: (score: number, total: number) => void;
}

export type QuizViewProps = SampleModeProps | JourneyModeProps;

// ─── Journey question helpers ─────────────────────────────────────────────────

function parseOptions(optionsJson: string): string[] {
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// ─── QuizView (sample mode) ───────────────────────────────────────────────────

function QuizViewSample({ questions, onComplete }: SampleModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    Array(questions.length).fill(null),
  );
  const [revealed, setRevealed] = useState<boolean[]>(() => Array(questions.length).fill(false));
  const [showResults, setShowResults] = useState(false);
  const [restoredAttempt, setRestoredAttempt] = useState<QuizAttempt | null>(null);

  // On mount: restore completed attempt from localStorage if present
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(SAMPLE_QUIZ_ATTEMPT_KEY);
    if (!raw) return;
    try {
      const attempt = JSON.parse(raw) as QuizAttempt;
      if (
        typeof attempt.score === "number" &&
        Array.isArray(attempt.answers) &&
        typeof attempt.completedAt === "string"
      ) {
        setAnswers(attempt.answers);
        setRestoredAttempt(attempt);
        setShowResults(true);
      }
    } catch {
      // Malformed attempt — start fresh
    }
  }, []);

  const question = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  function handleOptionClick(optionIdx: number) {
    if (revealed[currentIndex]) return;
    const next = answers.slice();
    next[currentIndex] = optionIdx;
    setAnswers(next);
    const nextRevealed = revealed.slice();
    nextRevealed[currentIndex] = true;
    setRevealed(nextRevealed);
  }

  function handleAdvance() {
    if (isLastQuestion) {
      const score =
        answers.reduce<number>((acc, ans, i) => {
          return acc + (ans === questions[i]!.correct_index ? 1 : 0);
        }, 0) / questions.length;

      const attempt: QuizAttempt = {
        score,
        answers,
        completedAt: new Date().toISOString(),
      };
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(SAMPLE_QUIZ_ATTEMPT_KEY, JSON.stringify(attempt));
      }
      setRestoredAttempt(attempt);
      setShowResults(true);
      onComplete?.();
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  // ── Results screen ──────────────────────────────────────────────────────────

  if (showResults) {
    const attempt = restoredAttempt;
    if (!attempt) return null;
    const correct = Math.round(attempt.score * questions.length);

    return (
      <div className="wp-quiz" data-testid="quiz-view">
        <div className="wp-quiz-results" data-testid="quiz-results">
          <div className="wp-quiz-score" data-testid="quiz-score">
            {correct} / {questions.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {correct === questions.length
              ? "Perfect score — well done!"
              : correct >= questions.length / 2
                ? "Good effort — review the explanations below."
                : "Keep going — each attempt builds your recall."}
          </p>

          <ol className="mt-6 text-left space-y-3">
            {questions.map((q, i) => {
              const ans = attempt.answers[i];
              const isCorrect = ans === q.correct_index;
              return (
                <li
                  key={q.id}
                  className={`wp-quiz-result-item ${isCorrect ? "wp-quiz-result-item--correct" : "wp-quiz-result-item--incorrect"}`}
                >
                  <span className="wp-quiz-result-icon" aria-hidden="true">
                    {isCorrect ? "✓" : "✗"}
                  </span>
                  <span className="wp-quiz-result-text">{q.question}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/sample" className="btn-base btn-outline btn-md">
              ← Back to Sample Journey
            </Link>
            <Link to="/" className="btn-base btn-primary btn-md">
              Start a real journey
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Active question ─────────────────────────────────────────────────────────

  const answered = revealed[currentIndex]!;
  const userAnswer = answers[currentIndex];
  const isCorrect = userAnswer === question!.correct_index;

  return (
    <div className="wp-quiz" data-testid="quiz-view">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)] mb-4">
        Question {currentIndex + 1} of {questions.length}
      </p>

      <p className="wp-quiz-question" data-testid={`quiz-question-${question!.id}`}>
        {question!.question}
      </p>

      <div className="space-y-2" role="group" aria-label="Answer options">
        {question!.options.map((opt, idx) => {
          let extraClass = "";
          if (answered) {
            if (idx === question!.correct_index) extraClass = " wp-quiz-option--correct";
            else if (idx === userAnswer) extraClass = " wp-quiz-option--incorrect";
            if (idx === userAnswer) extraClass += " wp-quiz-option--selected";
          }
          return (
            <button
              key={idx}
              type="button"
              className={`wp-quiz-option${extraClass}`}
              data-testid={`quiz-option-${idx}`}
              onClick={() => handleOptionClick(idx)}
              disabled={answered}
            >
              <span className="wp-quiz-option-letter" aria-hidden="true">
                {String.fromCharCode(65 + idx)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className={`wp-quiz-feedback ${isCorrect ? "wp-quiz-feedback--correct" : ""}`}
          data-testid="quiz-feedback"
          role="status"
          aria-live="polite"
        >
          <strong>{isCorrect ? "Correct!" : "Not quite."}</strong> {question!.explanation}
        </div>
      )}

      {answered && (
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-base btn-primary btn-md" onClick={handleAdvance}>
            {isLastQuestion ? "See Results" : "Next Question →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── QuizView (journey mode) ──────────────────────────────────────────────────

type JourneyAnswer =
  | { type: "mc"; optionIdx: number; isCorrect: boolean }
  | { type: "frq"; grading: GradingOutput };

function QuizViewJourney({ questions, journeyId, waypointId, onComplete }: JourneyModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mcSelection, setMcSelection] = useState<number | null>(null);
  const [frqText, setFrqText] = useState("");
  const [frqGrading, setFrqGrading] = useState<GradingOutput | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<(JourneyAnswer | null)[]>(() =>
    Array(questions.length).fill(null),
  );
  const [showResults, setShowResults] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="wp-quiz" data-testid="quiz-view">
        <p className="text-[var(--ink-muted)]">No questions available for this waypoint yet.</p>
      </div>
    );
  }

  const question = questions[currentIndex]!;
  const isLastQuestion = currentIndex === questions.length - 1;
  const options = question.type === "mc" ? parseOptions(question.options) : [];

  // ── MC answer ───────────────────────────────────────────────────────────────

  async function handleMcOptionClick(optionIdx: number) {
    if (answered) return;
    const selectedText = options[optionIdx]!;
    const isCorrect = selectedText === question.correct_answer;
    setMcSelection(optionIdx);
    setAnswered(true);

    const answer: JourneyAnswer = { type: "mc", optionIdx, isCorrect };
    const next = answers.slice();
    next[currentIndex] = answer;
    setAnswers(next);

    // Record attempt (score 2 if correct, 0 if not)
    try {
      await recordAttemptAndUpdateFsrs({
        data: {
          questionId: question.id,
          response: selectedText,
          score: isCorrect ? 2 : 0,
          feedback: isCorrect ? "Correct!" : "Not quite.",
          journeyId,
        },
      });
    } catch (err) {
      console.error("[quiz] recordAttemptAndUpdateFsrs failed", err);
    }
  }

  // ── FRQ answer ──────────────────────────────────────────────────────────────

  async function handleFrqSubmit() {
    if (answered || isGrading) return;
    setIsGrading(true);

    let grading: GradingOutput;
    try {
      grading = await gradeAnswer({
        data: { questionId: question.id, response: frqText, journeyId },
      });
    } catch (err) {
      console.error("[quiz] gradeAnswer failed", err);
      grading = {
        verdict: "incorrect",
        score: 0,
        feedback: "Could not grade your answer right now — please try again.",
      };
    }

    setFrqGrading(grading);
    setIsGrading(false);
    setAnswered(true);

    const answer: JourneyAnswer = { type: "frq", grading };
    const next = answers.slice();
    next[currentIndex] = answer;
    setAnswers(next);

    // Record attempt and update FSRS
    try {
      await recordAttemptAndUpdateFsrs({
        data: {
          questionId: question.id,
          response: frqText,
          score: grading.score,
          feedback: grading.feedback,
          journeyId,
        },
      });
    } catch (err) {
      console.error("[quiz] recordAttemptAndUpdateFsrs failed", err);
    }
  }

  // ── Advance ─────────────────────────────────────────────────────────────────

  function handleAdvance() {
    if (isLastQuestion) {
      // Compute score from the completed answers array before showing results.
      // `answers` is fully committed at this point (separate click event).
      const correctCount = answers.filter((a) => {
        if (!a) return false;
        if (a.type === "mc") return a.isCorrect;
        return a.grading.score >= 1;
      }).length;
      setShowResults(true);
      onComplete?.(correctCount, questions.length);
    } else {
      setCurrentIndex((i) => i + 1);
      setMcSelection(null);
      setFrqText("");
      setFrqGrading(null);
      setAnswered(false);
      setIsGrading(false);
    }
  }

  // ── Results screen ──────────────────────────────────────────────────────────

  if (showResults) {
    const correctCount = answers.filter((a) => {
      if (!a) return false;
      if (a.type === "mc") return a.isCorrect;
      return a.grading.score >= 1;
    }).length;

    return (
      <div className="wp-quiz" data-testid="quiz-view">
        <div className="wp-quiz-results" data-testid="quiz-results">
          <div className="wp-quiz-score" data-testid="quiz-score">
            {correctCount} / {questions.length}
          </div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {correctCount === questions.length
              ? "Perfect score — well done!"
              : correctCount >= questions.length / 2
                ? "Good effort — spaced repetition will reinforce these concepts."
                : "Keep going — each attempt strengthens your recall."}
          </p>

          <ol className="mt-6 text-left space-y-3">
            {questions.map((q, i) => {
              const ans = answers[i];
              const isOk = ans
                ? ans.type === "mc"
                  ? ans.isCorrect
                  : ans.grading.score >= 1
                : false;
              return (
                <li
                  key={q.id}
                  className={`wp-quiz-result-item ${isOk ? "wp-quiz-result-item--correct" : "wp-quiz-result-item--incorrect"}`}
                >
                  <span className="wp-quiz-result-icon" aria-hidden="true">
                    {isOk ? "✓" : "✗"}
                  </span>
                  <span className="wp-quiz-result-text">{q.question}</span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 flex justify-center">
            <Link
              to="/journey/$journeyId/waypoint/$waypointId"
              params={{ journeyId, waypointId }}
              className="btn-base btn-primary btn-md"
            >
              ← Back to Lesson
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Active MC question ──────────────────────────────────────────────────────

  if (question.type === "mc") {
    const answerRecord = answers[currentIndex];
    const mcAnswer = answerRecord?.type === "mc" ? answerRecord : null;
    const isCorrectMc = mcAnswer?.isCorrect ?? false;

    return (
      <div className="wp-quiz" data-testid="quiz-view">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)] mb-4">
          Question {currentIndex + 1} of {questions.length}
        </p>

        <p className="wp-quiz-question" data-testid={`quiz-question-${question.id}`}>
          {question.question}
        </p>

        <div className="space-y-2" role="group" aria-label="Answer options">
          {options.map((opt, idx) => {
            let extraClass = "";
            if (answered) {
              if (opt === question.correct_answer) extraClass = " wp-quiz-option--correct";
              else if (idx === mcSelection) extraClass = " wp-quiz-option--incorrect";
              if (idx === mcSelection) extraClass += " wp-quiz-option--selected";
            }
            return (
              <button
                key={idx}
                type="button"
                className={`wp-quiz-option${extraClass}`}
                data-testid={`quiz-option-${idx}`}
                onClick={() => void handleMcOptionClick(idx)}
                disabled={answered}
              >
                <span className="wp-quiz-option-letter" aria-hidden="true">
                  {String.fromCharCode(65 + idx)}
                </span>
                {opt}
              </button>
            );
          })}
        </div>

        {answered && (
          <div
            className={`wp-quiz-feedback ${isCorrectMc ? "wp-quiz-feedback--correct" : ""}`}
            data-testid="quiz-feedback"
            role="status"
            aria-live="polite"
          >
            <strong>{isCorrectMc ? "Correct!" : "Not quite."}</strong>{" "}
            {isCorrectMc
              ? "Great recall!"
              : question.correct_answer
                ? `The correct answer is: ${question.correct_answer}`
                : ""}
          </div>
        )}

        {answered && (
          <div className="mt-4 flex justify-end">
            <button type="button" className="btn-base btn-primary btn-md" onClick={handleAdvance}>
              {isLastQuestion ? "See Results" : "Next Question →"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Active FRQ question ─────────────────────────────────────────────────────

  const verdictClass = frqGrading
    ? frqGrading.verdict === "correct"
      ? "--correct"
      : frqGrading.verdict === "partial"
        ? "--partial"
        : "--incorrect"
    : "";

  return (
    <div className="wp-quiz" data-testid="quiz-view">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ink-muted)] mb-4">
        Question {currentIndex + 1} of {questions.length}
      </p>

      <p className="wp-quiz-question" data-testid={`quiz-question-${question.id}`}>
        {question.question}
      </p>

      <textarea
        className="wp-quiz-frq-input"
        data-testid="quiz-frq-input"
        value={frqText}
        onChange={(e) => setFrqText(e.target.value)}
        disabled={answered || isGrading}
        placeholder="Type your answer here…"
        aria-label="Your answer"
      />

      {isGrading && (
        <div
          className="wp-quiz-grading-state"
          data-testid="quiz-grading-state"
          role="status"
          aria-live="polite"
        >
          Checking your answer…
        </div>
      )}

      {frqGrading && (
        <div
          className={`wp-quiz-grade-verdict wp-quiz-grade-verdict${verdictClass}`}
          data-testid="quiz-grade-verdict"
          role="status"
          aria-live="polite"
        >
          <strong>
            {frqGrading.verdict === "correct"
              ? "Correct!"
              : frqGrading.verdict === "partial"
                ? "Partially correct"
                : "Not quite."}
          </strong>{" "}
          {frqGrading.feedback}
        </div>
      )}

      {!answered && !isGrading && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-base btn-primary btn-md"
            onClick={() => void handleFrqSubmit()}
          >
            Submit Answer
          </button>
        </div>
      )}

      {answered && (
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-base btn-primary btn-md" onClick={handleAdvance}>
            {isLastQuestion ? "See Results" : "Next Question →"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Unified export ───────────────────────────────────────────────────────────

export function QuizView(props: QuizViewProps) {
  if (props.mode === "sample") {
    return <QuizViewSample {...props} />;
  }
  return <QuizViewJourney {...props} />;
}
