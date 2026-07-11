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
