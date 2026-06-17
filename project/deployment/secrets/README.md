# Deployment Secret Files

This directory only keeps placeholder examples in Git.

For a Docker-secret Postgres runtime profile, create a local file outside the repository or an ignored file in this directory containing exactly one Postgres connection URL, then run:

```sh
BRAINSTY_DATABASE_URL_SECRET_FILE=/absolute/path/to/database-url \
  docker compose -f compose.yaml -f compose.postgres.yaml up --build
```

Do not commit real database URLs, passwords, exported credentials, screenshots, OCR text, or PHI here.
