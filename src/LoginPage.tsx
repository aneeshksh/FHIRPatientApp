import { useState, type FormEvent } from "react";
import type { PublicUser } from "./authClient";

type LoginPageProps = {
  onLoginSuccess: (user: PublicUser) => void;
};

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(body?.error ?? `Login failed (${res.status})`);
      }

      onLoginSuccess(body.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-panel" onSubmit={handleSubmit}>
        <h1>Sign in</h1>
        <p className="login-subtitle">FHIR Patient App</p>

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            disabled={submitting}
            required
            autoFocus
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={submitting}
            required
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
