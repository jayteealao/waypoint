/**
 * Domain collections for the remaining eight client-read entities (shape D8 /
 * Entity Migration Plan). Journeys lives in its own module (`store/journeys.ts`)
 * as the read-path exemplar; the rest are consolidated here because each is the
 * same three-line factory call — a per-entity file per the plan would be pure
 * boilerplate (build discipline: fewest lines). `usage_events` is intentionally
 * absent — server-write-only, no client read surface, cost-data privacy floor
 * (shape Q-B).
 *
 * Every collection is schema-typed via `defineDomainCollection`, so `useLiveQuery`
 * over any of them types with no `as any` (AC-DLU2), persists per-user under
 * `wp:<userId>:<entity>` (AC-DLU7), and is SSR-safe (server build is an empty
 * throwaway; loaders render SSR — shape D3).
 *
 * ── Read entities ────────────────────────────────────────────────────────────
 * waypoints, lessons, quiz-questions, concepts, adaptations carry no write
 * handlers: their mutations are owned by server functions (generateRoadmap,
 * lesson SSE, generateQuiz, proposeAdaptation/respondToProposal) whose writes
 * are coupled server-side commands, not client CRUD. The collections are the
 * client cache + reactive read path; the loader seeds them from D1.
 *
 * ── Write entities (quiz-attempts, fsrs-cards) ───────────────────────────────
 * Defined schema-typed as the local cache backing progress reads. They carry NO
 * production optimistic-write handler by deliberate deviation from the plan's
 * "onInsert flushing to D1": the server surface `recordAttemptAndUpdateFsrs`
 * (src/server/quiz.ts:373) is a COUPLED grading command — it inserts the attempt
 * AND applies the FSRS rating AND generates the attempt id server-side. An
 * optimistic `collection.insert` would (a) assign a client id that diverges from
 * the server-generated PK (orphan on next seed) and (b) duplicate the coupled
 * grading logic, regressing a shipped, live-smoke-verified flow (AC-DLU9). The
 * grading command remains the write path. The AC-DLU8 optimistic-write +
 * rollback MECHANISM is proven at the factory level (tests/smoke/lww-reconcile
 * forced-flush-failure), which is what the plan's verification strategy names.
 */
import { defineDomainCollection } from "#/lib/db/collection-factory";
import {
  waypointSchema,
  lessonSchema,
  quizQuestionSchema,
  conceptSchema,
  adaptationSchema,
  quizAttemptSchema,
  conceptFsrsCardSchema,
} from "#/lib/db/schemas";

const waypointsHandle = defineDomainCollection({
  entity: "waypoints",
  schema: waypointSchema,
  getKey: (w) => w.id,
});

const lessonsHandle = defineDomainCollection({
  entity: "lessons",
  schema: lessonSchema,
  getKey: (l) => l.id,
});

const quizQuestionsHandle = defineDomainCollection({
  entity: "quiz-questions",
  schema: quizQuestionSchema,
  getKey: (q) => q.id,
});

const conceptsHandle = defineDomainCollection({
  entity: "concepts",
  schema: conceptSchema,
  getKey: (c) => c.id,
});

const adaptationsHandle = defineDomainCollection({
  entity: "adaptations",
  schema: adaptationSchema,
  getKey: (a) => a.id,
});

const quizAttemptsHandle = defineDomainCollection({
  entity: "quiz-attempts",
  schema: quizAttemptSchema,
  getKey: (a) => a.id,
});

const fsrsCardsHandle = defineDomainCollection({
  entity: "fsrs-cards",
  schema: conceptFsrsCardSchema,
  getKey: (f) => f.id,
});

/** Get (or lazily create) the user's waypoints collection, seeding from D1. */
export const getWaypointsCollection = waypointsHandle.get;
/** Get (or lazily create) the user's lessons collection, seeding from D1. */
export const getLessonsCollection = lessonsHandle.get;
/** Get (or lazily create) the user's quiz-questions collection, seeding from D1. */
export const getQuizQuestionsCollection = quizQuestionsHandle.get;
/** Get (or lazily create) the user's concepts collection, seeding from D1. */
export const getConceptsCollection = conceptsHandle.get;
/** Get (or lazily create) the user's adaptations collection, seeding from D1. */
export const getAdaptationsCollection = adaptationsHandle.get;
/** Get (or lazily create) the user's quiz-attempts cache collection. */
export const getQuizAttemptsCollection = quizAttemptsHandle.get;
/** Get (or lazily create) the user's FSRS-cards cache collection. */
export const getFsrsCardsCollection = fsrsCardsHandle.get;

/** Test-only: reset every remaining-entity registry between specs. */
export function _resetCollectionRegistries(): void {
  waypointsHandle._resetRegistry();
  lessonsHandle._resetRegistry();
  quizQuestionsHandle._resetRegistry();
  conceptsHandle._resetRegistry();
  adaptationsHandle._resetRegistry();
  quizAttemptsHandle._resetRegistry();
  fsrsCardsHandle._resetRegistry();
}
