-- Exact namespace searches must not scan every schema element.
CREATE INDEX document_schema_namespace ON document_schema_elements(namespace, version_id);
