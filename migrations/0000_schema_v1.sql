-- Waypoint v1 schema — full domain in one act.
-- Every table uses CREATE TABLE IF NOT EXISTS for idempotency (re-apply is a no-op).
-- better-auth tables use camelCase columns per better-auth v1.6.x SQLite conventions.
-- Domain tables use snake_case per project convention.
-- Each domain table comment cites the slice AC that consumes it.

-- ┌──────────────────────────────────────────────────────────────┐
-- │ better-auth tables (user, session, account, verification)    │
-- │ These are managed by better-auth v1.6.23 internally.         │
-- │ Schema derived from getAuthTables({}) for D1/SQLite.         │
-- └──────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS `user` (
  `id`            TEXT    PRIMARY KEY,
  `name`          TEXT    NOT NULL,
  `email`         TEXT    NOT NULL UNIQUE,
  `emailVerified` INTEGER NOT NULL DEFAULT 0,
  `image`         TEXT,
  `createdAt`     INTEGER NOT NULL,
  `updatedAt`     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `session` (
  `id`         TEXT    PRIMARY KEY,
  `expiresAt`  INTEGER NOT NULL,
  `token`      TEXT    NOT NULL UNIQUE,
  `createdAt`  INTEGER NOT NULL,
  `updatedAt`  INTEGER NOT NULL,
  `ipAddress`  TEXT,
  `userAgent`  TEXT,
  `userId`     TEXT    NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `account` (
  `id`                    TEXT    PRIMARY KEY,
  `accountId`             TEXT    NOT NULL,
  `providerId`            TEXT    NOT NULL,
  `userId`                TEXT    NOT NULL REFERENCES `user`(`id`) ON DELETE CASCADE,
  `accessToken`           TEXT,
  `refreshToken`          TEXT,
  `idToken`               TEXT,
  `accessTokenExpiresAt`  INTEGER,
  `refreshTokenExpiresAt` INTEGER,
  `scope`                 TEXT,
  `password`              TEXT,
  `createdAt`             INTEGER NOT NULL,
  `updatedAt`             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS `verification` (
  `id`         TEXT    PRIMARY KEY,
  `identifier` TEXT    NOT NULL,
  `value`      TEXT    NOT NULL,
  `expiresAt`  INTEGER NOT NULL,
  `createdAt`  INTEGER,
  `updatedAt`  INTEGER
);

-- Indexes for better-auth lookups
CREATE INDEX IF NOT EXISTS session_userId_idx        ON `session`(`userId`);
CREATE INDEX IF NOT EXISTS account_userId_idx        ON `account`(`userId`);
CREATE INDEX IF NOT EXISTS account_providerAccount_idx ON `account`(`providerId`, `accountId`);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ Domain tables                                                 │
-- │ (accounts-data-layer AC-ADL3; each table cites its AC)       │
-- └──────────────────────────────────────────────────────────────┘

-- Consumes: AC-ADL1 (multi-user isolation), tutor-interview + roadmap-lesson-generation (data)
CREATE TABLE IF NOT EXISTS journeys (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES `user`(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  goal       TEXT,
  status     TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS journeys_user_id_idx ON journeys(user_id);

-- Consumes: roadmap-lesson-generation (waypoint ordering)
CREATE TABLE IF NOT EXISTS waypoints (
  id         TEXT    PRIMARY KEY,
  journey_id TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  goal       TEXT,
  concepts   TEXT    NOT NULL DEFAULT '[]'  -- JSON array of concept names
);

CREATE INDEX IF NOT EXISTS waypoints_journey_id_idx ON waypoints(journey_id);

-- Consumes: lesson-renderer (content display)
CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT    PRIMARY KEY,
  waypoint_id TEXT    NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
  content     TEXT,
  sources     TEXT    NOT NULL DEFAULT '[]',  -- JSON array of source URLs/titles
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS lessons_waypoint_id_idx ON lessons(waypoint_id);

-- Consumes: quiz-fsrs (question bank); type column extensible to future 'task' type
CREATE TABLE IF NOT EXISTS quiz_questions (
  id           TEXT    PRIMARY KEY,
  waypoint_id  TEXT    NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL DEFAULT 'mc',  -- 'mc' | 'frq' | 'task' (extensible)
  question     TEXT    NOT NULL,
  options      TEXT    NOT NULL DEFAULT '[]',  -- JSON array for MC choices
  correct_answer TEXT,
  concept_id   TEXT    REFERENCES concepts(id),
  rubric       TEXT
);

CREATE INDEX IF NOT EXISTS quiz_questions_waypoint_id_idx ON quiz_questions(waypoint_id);

-- Consumes: quiz-fsrs (attempt history + FSRS scoring)
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES `user`(id) ON DELETE CASCADE,
  quiz_question_id TEXT    NOT NULL REFERENCES quiz_questions(id),
  response         TEXT,
  score            REAL,
  feedback         TEXT,
  created_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_id_idx ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_question_id_idx ON quiz_attempts(quiz_question_id);

-- Consumes: quiz-fsrs (concept graph), source-grounding (concept attribution)
CREATE TABLE IF NOT EXISTS concepts (
  id          TEXT PRIMARY KEY,
  journey_id  TEXT NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS concepts_journey_id_idx ON concepts(journey_id);

-- Consumes: quiz-fsrs (FSRS scheduling — 7 fields per ts-fsrs v5.4.1)
-- due/stability/difficulty/reps/lapses/state/last_review map to ts-fsrs Card fields
CREATE TABLE IF NOT EXISTS concept_fsrs_cards (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES `user`(id) ON DELETE CASCADE,
  concept_id  TEXT    NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  due         INTEGER,          -- next review timestamp (ms)
  stability   REAL,             -- memory stability (ts-fsrs)
  difficulty  REAL,             -- retrievability difficulty
  reps        INTEGER NOT NULL DEFAULT 0,
  lapses      INTEGER NOT NULL DEFAULT 0,
  state       TEXT    NOT NULL DEFAULT 'New',  -- 'New'|'Learning'|'Review'|'Relearning'
  last_review INTEGER           -- last review timestamp (ms)
);

CREATE INDEX IF NOT EXISTS fsrs_user_due_idx ON concept_fsrs_cards(user_id, due);
CREATE UNIQUE INDEX IF NOT EXISTS fsrs_user_concept_idx ON concept_fsrs_cards(user_id, concept_id);

-- Consumes: ai-gateway (quota enforcement + cost attribution per 04b-instrument.md)
CREATE TABLE IF NOT EXISTS usage_events (
  id                TEXT    PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id           TEXT    NOT NULL REFERENCES `user`(id) ON DELETE CASCADE,
  journey_id        TEXT    REFERENCES journeys(id),
  model             TEXT    NOT NULL,
  type              TEXT    NOT NULL CHECK(type IN ('interview', 'lesson', 'quiz', 'roadmap')),
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL    NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  outcome           TEXT    NOT NULL DEFAULT 'success',
  at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS usage_events_user_at_idx ON usage_events(user_id, at);
