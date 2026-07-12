-- Migration: adaptation proposal history
-- Additive only — does not alter any existing table.
-- Each row represents a single adaptation proposal generated after a weak quiz.
-- status: 'proposed' | 'accepted' | 'declined'

CREATE TABLE IF NOT EXISTS adaptations (
  id                TEXT    PRIMARY KEY,
  journey_id        TEXT    NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
  user_id           TEXT    NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  waypoint_after_id TEXT    REFERENCES waypoints(id),
  proposed_title    TEXT    NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'proposed',
  created_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS adaptations_journey_id_idx ON adaptations(journey_id);
