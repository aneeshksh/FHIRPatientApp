const rawBaseUrl = process.env.FHIR_BASE_URL;
const rawToken = process.env.FHIR_BEARER_TOKEN ?? process.env.BEARER_TOKEN;

if (!rawBaseUrl || !rawToken) {
  throw new Error(
    "Missing FHIR_BASE_URL or FHIR_BEARER_TOKEN (or BEARER_TOKEN) in .env",
  );
}

export const FHIR_BASE_URL: string = rawBaseUrl;
export const FHIR_BEARER_TOKEN: string = rawToken;
