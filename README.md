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
```

## Development

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
  --set-env-vars FHIR_BASE_URL=https://your-fhir-server/fhir/tenant-id \
  --set-secrets FHIR_BEARER_TOKEN=fhir-bearer-token:latest
```

The `FHIR_BEARER_TOKEN` secret must exist first: `gcloud secrets create fhir-bearer-token --data-file=-` (paste the token, then Ctrl-D), and the Cloud Run service's runtime service account needs the `Secret Manager Secret Accessor` role on it. If you'd rather not use Secret Manager, `--set-env-vars` works for the token too, but it will then be visible in the service's revision config.

`.env` is excluded from the image via `.dockerignore` — it's only for local dev.
