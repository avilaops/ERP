-- A library belongs to one tenant's schema, like the rest of the ERP.
-- Official collections are readable by that company's users, never anonymous.
CREATE TABLE document_collections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_-]+$'),
  visibility text NOT NULL CHECK (visibility IN ('official', 'private')),
  owner_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_id bigint NOT NULL REFERENCES document_collections(id),
  url text NOT NULL,
  allowed_hosts text[] NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, url),
  UNIQUE (id, collection_id)
);
CREATE TABLE library_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  collection_id bigint NOT NULL REFERENCES document_collections(id),
  source_id bigint NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'material-tecnico',
  current_version_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, collection_id) REFERENCES document_sources(id, collection_id),
  UNIQUE (collection_id, url)
);
CREATE TABLE document_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES library_documents(id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  mime text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  final_url text NOT NULL,
  etag text,
  last_modified text,
  published_at timestamptz,
  valid_from date,
  valid_until date,
  version_label text,
  extractor text NOT NULL,
  status text NOT NULL CHECK (status IN ('indexed', 'partial', 'failed')),
  warnings jsonb NOT NULL DEFAULT '[]',
  metadata jsonb NOT NULL DEFAULT '{}',
  collected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, sha256, extractor),
  UNIQUE (id, document_id)
);
ALTER TABLE library_documents ADD CONSTRAINT document_current_version_fk
  FOREIGN KEY (current_version_id, id) REFERENCES document_versions(id, document_id);
CREATE TABLE document_chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES document_versions(id),
  ordinal integer NOT NULL,
  page integer NOT NULL CHECK (page > 0),
  section text NOT NULL DEFAULT '',
  content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese'::regconfig, content)) STORED,
  UNIQUE (version_id, ordinal)
);
CREATE INDEX document_chunks_fts ON document_chunks USING gin(search_vector);
CREATE INDEX document_chunks_version ON document_chunks(version_id, ordinal);
CREATE TABLE document_schema_elements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version_id bigint NOT NULL REFERENCES document_versions(id),
  archive_path text NOT NULL DEFAULT '',
  namespace text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  type_name text,
  min_occurs text,
  max_occurs text,
  documentation text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX document_schema_exact ON document_schema_elements(name, namespace, version_id);
CREATE TABLE document_links (
  source_version_id bigint NOT NULL REFERENCES document_versions(id),
  url text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('queued','excluded')),
  reason text NOT NULL DEFAULT '',
  PRIMARY KEY (source_version_id, url)
);
CREATE TABLE document_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL,
  collection_id bigint NOT NULL,
  url text NOT NULL,
  depth integer NOT NULL DEFAULT 0 CHECK (depth >= 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','running','indexed','partial','failed','blocked')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  last_http integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, collection_id) REFERENCES document_sources(id, collection_id),
  UNIQUE (collection_id, url)
);
CREATE INDEX document_jobs_claim ON document_jobs(available_at, id) WHERE state IN ('pending','running');
CREATE TABLE document_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES document_jobs(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL DEFAULT 'running',
  detail text,
  http_status integer,
  bytes bigint,
  sha256 text
);
CREATE INDEX library_documents_cursor ON library_documents(collection_id, id DESC);
CREATE INDEX library_documents_title ON library_documents(title);
CREATE INDEX document_versions_hash ON document_versions(sha256);
CREATE INDEX document_versions_mime_date ON document_versions(mime, collected_at DESC);
