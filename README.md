# FHIR Patient App

A patient listing module that proxies FHIR requests and displays patients from a configured FHIR server.

## Setup

```bash
bun install
```

Create a `.env` file:

```
FHIR_BASE_URL=https://your-fhir-server/fhir/tenant-id
FHIR_BEARER_TOKEN=your-token

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your-password
DB_NAME=fhir_patient_app
```

The app stores users/sessions in MySQL (via `mysql2`) and creates the `users` and `sessions` tables automatically on startup.

## Development

You need a MySQL server to connect to. Either works:

- **Local MySQL** — install it, create the database (`CREATE DATABASE fhir_patient_app;`), and point `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` at it.
- **Cloud SQL via the Auth Proxy** — run `cloud-sql-proxy --port 3306 PROJECT:REGION:INSTANCE` and use the same `DB_HOST=127.0.0.1`/`DB_PORT=3306` — the proxy looks like a plain local MySQL server, so no code changes are needed.

```bash
bun dev
```

## Production

```bash
bun start
```

## Deploy to Cloud Run

Build and deploy directly from source (Cloud Build builds the `Dockerfile` for you):

```bash
gcloud run deploy fhir-patient-app \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --set-env-vars FHIR_BASE_URL=https://your-fhir-server/fhir/tenant-id,DB_SOCKET_PATH=/cloudsql/PROJECT:REGION:INSTANCE,DB_USER=your-db-user,DB_NAME=fhir_patient_app \
  --set-secrets FHIR_BEARER_TOKEN=fhir-bearer-token:latest,DB_PASSWORD=db-password:latest
```

The `FHIR_BEARER_TOKEN` secret must exist first: `gcloud secrets create fhir-bearer-token --data-file=-` (paste the token, then Ctrl-D), and the Cloud Run service's runtime service account needs the `Secret Manager Secret Accessor` role on it. If you'd rather not use Secret Manager, `--set-env-vars` works for the token too, but it will then be visible in the service's revision config. Do the same for a `db-password` secret holding the MySQL user's password.

`--add-cloudsql-instances` makes Cloud Run mount the Cloud SQL instance as a Unix socket at `/cloudsql/PROJECT:REGION:INSTANCE` — no Cloud SQL Auth Proxy sidecar needed in production. `DB_SOCKET_PATH` tells the app to connect over that socket instead of TCP.

`.env` is excluded from the image via `.dockerignore` — it's only for local dev.
