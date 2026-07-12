-- Migration: source grounding content column
-- Additive only — adds captured_source_content to interview_records.
-- Default '[]' ensures existing rows are valid (empty source content array).
-- Each entry: { url: string, title: string, extractedText: string }

ALTER TABLE interview_records ADD COLUMN captured_source_content TEXT NOT NULL DEFAULT '[]';
