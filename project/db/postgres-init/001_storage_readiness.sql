CREATE TABLE IF NOT EXISTS brainsty_storage_readiness (
  id TEXT PRIMARY KEY,
  contract_version TEXT NOT NULL,
  service_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO brainsty_storage_readiness (id, contract_version, service_name)
VALUES ('brainstyworkers-postgres-compose', '2026-06-15.postgres-storage-profile.v1', 'postgres')
ON CONFLICT (id)
DO UPDATE SET
  contract_version = EXCLUDED.contract_version,
  service_name = EXCLUDED.service_name,
  updated_at = now();
