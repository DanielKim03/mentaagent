-- Semantic retrieval: per-chunk embeddings (pgvector) fused with the FTS
-- index at query time (RRF). Defensive: if the server's Postgres doesn't
-- ship pgvector, this migration NO-OPS instead of failing the deploy. The
-- code feature-detects the column and keeps FTS-only behavior.
--
-- vector(1024) matches BAAI/bge-m3 (the default EMBEDDINGS_MODEL). Switching
-- to a model with a different dimension needs a column rebuild.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgvector unavailable (%) — semantic retrieval disabled, FTS-only', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);
    -- HNSW: good recall at this scale with zero tuning; cosine ops to match
    -- the <=> queries in retrieval.
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
      ON chunks USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;
