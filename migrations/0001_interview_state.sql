-- Interview state migration — additive only.
-- Adds interview_records table; zero changes to existing tables.
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Consumes: tutor-interview slice (AC-TI1, AC-TI3, AC-TI4)

CREATE TABLE IF NOT EXISTS interview_records (
  id              TEXT    PRIMARY KEY,
  journey_id      TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id         TEXT    NOT NULL REFERENCES `user`(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'complete' | 'consent_declined' | 'best_effort'
  stage           TEXT    NOT NULL DEFAULT 'consent',  -- 'consent' | 'mission' | 'scope' | 'prior_knowledge' | 'sources' | 'complete' | 'declined'
  turns           TEXT    NOT NULL DEFAULT '[]',        -- JSON array of InterviewTurn
  -- Captured fields (populated as interview advances)
  captured_mission        TEXT,
  captured_scope          TEXT,
  captured_prior_knowledge TEXT,
  captured_source_urls    TEXT NOT NULL DEFAULT '[]',  -- JSON array of URL strings
  best_effort             INTEGER NOT NULL DEFAULT 0,  -- 1 if consent was declined
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS interview_records_journey_id_idx ON interview_records(journey_id);
CREATE INDEX IF NOT EXISTS interview_records_user_id_idx ON interview_records(user_id);
