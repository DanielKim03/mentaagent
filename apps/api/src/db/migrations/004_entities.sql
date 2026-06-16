-- Knowledge graph: entities extracted from documents + the document↔entity
-- edges that connect the dataset. This is what powers the /graph view and
-- the find_connections agent tool (traverse from any entity/document to the
-- others it co-occurs with — the "AI wiki" connective tissue, minus the
-- prose-rewriting cost of a full wiki).

CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- lowercased/trimmed key for dedup within a workspace
  norm TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'other'
    CHECK (entity_type IN ('customer', 'vendor', 'product', 'person', 'contract', 'location', 'other')),
  mention_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, norm)
);
CREATE INDEX entities_workspace_idx ON entities(workspace_id);

CREATE TABLE document_entities (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, entity_id)
);
CREATE INDEX document_entities_entity_idx ON document_entities(entity_id);
CREATE INDEX document_entities_workspace_idx ON document_entities(workspace_id);

-- Marks whether a document has been run through entity extraction yet, so the
-- backfill sweep can find documents ingested before this feature existed.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS entities_extracted_at TIMESTAMPTZ;
