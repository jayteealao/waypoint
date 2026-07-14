/**
 * Fixture content for the sample journey — Waypoint's pre-baked first-run experience.
 *
 * Two full lessons covering Waypoint's learn-quiz-review loop and spaced repetition,
 * plus a four-question multiple-choice quiz. No LLM calls required: all content is
 * authored here as TypeScript constants and imported directly by the sample-journey
 * route files at build time.
 *
 * Option-length rule for SAMPLE_QUIZ: within each question, all four options must
 * be ≤ 5 characters apart in length after trimEnd() — no formatting clues.
 * This is enforced by tests/smoke/sample-journey.test.ts on every `pnpm test` run.
 */

import type { LessonDocumentV1 } from "#/types/lesson-document";
import type { ShellWaypoint } from "#/components/shell/AppShell";

// ─── localStorage keys ────────────────────────────────────────────────────────

export const SAMPLE_JOURNEY_VISITED_KEY = "wp:sample-visited";
export const SAMPLE_QUIZ_ATTEMPT_KEY = "wp:sample-quiz:attempt";
export const LESSON_1_VISITED_KEY = "wp:sample:lesson-1";
export const LESSON_2_VISITED_KEY = "wp:sample:lesson-2";

// ─── Waypoints ────────────────────────────────────────────────────────────────

/**
 * Static waypoint definitions for the sample journey.
 * `completed` is always false here — the sample layout route derives live
 * completion state from localStorage and passes the updated array to setWaypoints.
 */
export const SAMPLE_WAYPOINTS: ShellWaypoint[] = [
  { id: "sw-intro", label: "Welcome to Waypoint", href: "/sample", completed: false },
  { id: "sw-lesson-1", label: "How Waypoint Teaches", href: "/sample/lesson-1", completed: false },
  { id: "sw-lesson-2", label: "Spaced Repetition", href: "/sample/lesson-2", completed: false },
  { id: "sw-quiz", label: "Check Your Understanding", href: "/sample/quiz", completed: false },
];

// ─── Lesson 1: How Waypoint Teaches ──────────────────────────────────────────

export const SAMPLE_LESSON_1: LessonDocumentV1 = {
  version: 1,
  title: "How Waypoint Teaches",
  summary: "Understand the adaptive learn-quiz-review loop that powers every Waypoint journey.",
  sections: [
    {
      type: "heading",
      id: "h-loop",
      level: 2,
      text: "The Loop: Learn, Quiz, Review",
    },
    {
      type: "prose",
      id: "p-loop",
      html: "Waypoint does not send you on a linear march through a syllabus. Instead it runs a three-step loop for every concept you encounter: you <strong>learn</strong> it once in a lesson, <strong>quiz</strong> your recall immediately after, then <strong>review</strong> it again exactly when the algorithm predicts your memory is about to slip. Each pass through the loop builds a little more retention than the last.",
    },
    {
      type: "prose",
      id: "p-loop-2",
      html: "The review schedule is not guesswork. Waypoint uses a <em>spaced repetition</em> algorithm — the same family of algorithms behind decades of research on how memory works — to predict when each concept needs reinforcement. Do well on a quiz and the next review slot is pushed further out. Struggle, and it comes back sooner. Over time, you spend less effort maintaining what you already know solidly and more effort on what still needs work.",
    },
    {
      type: "heading",
      id: "h-roadmap",
      level: 2,
      text: "Your Roadmap",
    },
    {
      type: "prose",
      id: "p-roadmap",
      html: "Every learning goal in Waypoint is a <strong>journey</strong>. A journey is broken into <strong>waypoints</strong> — milestones that each cover one topic with its own lesson and quiz. You can see your waypoints in the sidebar; completing each one marks you as ready to move forward. The roadmap adapts as you progress: waypoints you have mastered shrink in the review queue, and new ones open as the AI tutor determines you are ready.",
    },
    {
      type: "citation",
      id: "cit-retrieval",
      quote:
        "The act of retrieving a memory — rather than merely re-reading material — is itself one of the most powerful memory consolidators we know of.",
      source: "Make It Stick: The Science of Successful Learning (Brown, Roediger, McDaniel)",
      url: null,
    },
    {
      type: "widget",
      id: "wgt-checkpoint-1",
      widget_type: "checkpoint-question",
      props: {
        question: "What triggers a concept review in Waypoint?",
        options: [
          "A timed alarm that fires every 24 hours",
          "A quiz result showing incomplete recall",
          "Clicking the Review button in settings",
          "The app selecting concepts at random",
        ],
        correct_index: 1,
        explanation:
          "Waypoint's spaced repetition algorithm tracks how well you recalled each concept on the last quiz. A poor result triggers an earlier review; a strong result pushes the next review further out.",
      },
    },
    {
      type: "widget",
      id: "wgt-flipcard-1",
      widget_type: "flipcard",
      props: {
        front: "What is a waypoint?",
        back: "A milestone in your learning journey — a topic, complete with its own lesson and quiz. Completing a waypoint marks you as ready to move forward on the roadmap.",
      },
    },
  ],
  sources: [
    {
      title: "Make It Stick: The Science of Successful Learning",
      url: "https://www.hup.harvard.edu/books/9780674729018",
      author: "Peter C. Brown, Henry L. Roediger III, Mark A. McDaniel",
    },
  ],
  recommended_primary_source: {
    title: "Make It Stick: The Science of Successful Learning",
    url: "https://www.hup.harvard.edu/books/9780674729018",
    author: "Peter C. Brown, Henry L. Roediger III, Mark A. McDaniel",
  },
};

// ─── Lesson 2: Spaced Repetition ─────────────────────────────────────────────

export const SAMPLE_LESSON_2: LessonDocumentV1 = {
  version: 1,
  title: "Spaced Repetition",
  summary:
    "How the forgetting curve works and why Waypoint's review algorithm beats cramming every time.",
  sections: [
    {
      type: "heading",
      id: "h-forget",
      level: 2,
      text: "Why You Forget (and Why That's OK)",
    },
    {
      type: "prose",
      id: "p-forget",
      html: "In the 1880s, psychologist Hermann Ebbinghaus tested his own memory with nonsense syllables and discovered something humbling: within a day of learning something new, you forget roughly <strong>50%</strong> of it. Within a week, the figure climbs past 70%. This decay curve is not a flaw in how your brain works — it is an optimisation. Your brain prioritises information that is retrieved repeatedly over time, because repeated retrieval is the best signal that something is worth keeping long-term.",
    },
    {
      type: "prose",
      id: "p-spacing",
      html: "Spaced repetition exploits this mechanism deliberately. Instead of reviewing a concept once and hoping it sticks, you review it just as it is about to be forgotten — which reinforces the memory trace more effectively than reviewing it when it is still fresh. Each well-timed review extends the gap to the next one. After four or five well-spaced reviews, most concepts move into long-term retention and need only rare refreshers to stay sharp.",
    },
    {
      type: "heading",
      id: "h-fsrs",
      level: 2,
      text: "FSRS: The Engine Under the Hood",
    },
    {
      type: "prose",
      id: "p-fsrs",
      html: "Waypoint uses <strong>FSRS</strong> (Free Spaced Repetition Scheduler), an open-source algorithm developed from large-scale memory research. FSRS models two key properties of your memory for each concept: <em>stability</em> (how long before you forget it) and <em>difficulty</em> (how hard the concept is for you specifically). After every quiz answer, Waypoint updates both values and schedules the next review at the moment your predicted recall drops below a threshold — typically around 90%.",
    },
    {
      type: "citation",
      id: "cit-fsrs",
      quote:
        "FSRS is a spaced repetition algorithm that can memorize the forgetting curves of each memory item individually, allowing precise scheduling of future review.",
      source: "open-spaced-repetition/fsrs4anki (GitHub)",
      url: "https://github.com/open-spaced-repetition/fsrs4anki",
    },
    {
      type: "widget",
      id: "wgt-checkpoint-2",
      widget_type: "checkpoint-question",
      props: {
        question: "What two properties does FSRS track per concept?",
        options: [
          "Frequency and importance",
          "Stability and difficulty",
          "Recall rate and error count",
          "Study time and test scores",
        ],
        correct_index: 1,
        explanation:
          "FSRS models stability (how long the memory is predicted to last before forgetting) and difficulty (how hard the concept is for you specifically). Together they determine the optimal review interval.",
      },
    },
    {
      type: "widget",
      id: "wgt-flipcard-2",
      widget_type: "flipcard",
      props: {
        front: "What does FSRS stand for?",
        back: "Free Spaced Repetition Scheduler — an open-source algorithm that models memory stability and difficulty per concept to predict the optimal review time for each individual learner.",
      },
    },
  ],
  sources: [
    {
      title: "open-spaced-repetition/fsrs4anki",
      url: "https://github.com/open-spaced-repetition/fsrs4anki",
      author: "Jarrett Ye",
    },
  ],
  recommended_primary_source: {
    title: "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling",
    url: "https://github.com/open-spaced-repetition/fsrs4anki",
    author: "Jarrett Ye",
  },
};

// ─── Sample quiz ──────────────────────────────────────────────────────────────

export interface SampleQuizQuestion {
  id: string;
  question: string;
  /** Four options; within each question options must be ≤ 5 chars apart (trimEnd). */
  options: string[];
  correct_index: number;
  explanation: string;
}

/**
 * Four multiple-choice questions covering both sample lessons.
 *
 * Option-length deltas (verified by tests/smoke/sample-journey.test.ts):
 *   Q1: 30–32 → delta 2
 *   Q2: 36–38 → delta 2
 *   Q3: 28–31 → delta 3
 *   Q4: 24–27 → delta 3
 *
 * correct_index alignment for the Vitest scoring test (answers = [1, 0, 2, 1]):
 *   Q1 correct=0, answer=1 → wrong
 *   Q2 correct=0, answer=0 → right
 *   Q3 correct=2, answer=2 → right
 *   Q4 correct=1, answer=1 → right
 *   Score: 3 / 4
 */
export const SAMPLE_QUIZ: SampleQuizQuestion[] = [
  {
    id: "sq-1",
    question: "What is a journey in Waypoint?",
    options: [
      "A learning goal you work through", // 32
      "A timed challenge you complete", // 30
      "A collection of videos to watch", // 31
      "A weekly study plan you follow", // 30
    ],
    correct_index: 0,
    explanation:
      "A journey is a learning goal you work through step by step — broken into waypoints, each with its own lesson and quiz.",
  },
  {
    id: "sq-2",
    question: "How does spaced repetition beat cramming?",
    options: [
      "Review just as you are about to forget", // 38
      "Study the same content multiple times", // 37
      "Use flashcards for every new concept", // 36
      "Track your total hours of study time", // 36
    ],
    correct_index: 0,
    explanation:
      "Reviewing at the moment you are about to forget reinforces the memory trace more strongly than re-reading material that is still fresh. Each well-timed review extends the gap to the next one.",
  },
  {
    id: "sq-3",
    question: "When does quiz feedback appear in Waypoint?",
    options: [
      "Only after the full quiz ends", // 29
      "When you reach the score screen", // 31
      "Immediately after you select", // 28
      "After a brief two-second wait", // 29
    ],
    correct_index: 2,
    explanation:
      "Waypoint shows feedback — whether you were right or wrong and why — immediately after you select an answer, before advancing to the next question.",
  },
  {
    id: "sq-4",
    question: "What two properties does FSRS model per concept?",
    options: [
      "Frequency and importance", // 24
      "Stability and difficulty", // 24
      "Recall rate and error count", // 26
      "Study time and test scores", // 25
    ],
    correct_index: 1,
    explanation:
      "FSRS tracks stability (how long the memory lasts before forgetting) and difficulty (how hard the concept is for you). Together they determine the optimal time for the next review.",
  },
];
