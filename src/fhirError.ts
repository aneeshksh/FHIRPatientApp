export function extractFhirError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const outcome = body as {
    issue?: { diagnostics?: string; details?: { text?: string } }[];
  };
  const issue = outcome.issue?.[0];
  return issue?.diagnostics ?? issue?.details?.text ?? null;
}
