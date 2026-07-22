import { useState, type FormEvent, type ReactNode } from "react";
import type { PublicUser } from "./authClient";

type LoginPageProps = {
  onLoginSuccess: (user: PublicUser) => void;
};

type Feature = {
  icon: ReactNode;
  text: string;
};

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const FEATURES: Feature[] = [
  {
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <line x1="20" y1="20" x2="15.5" y2="15.5" />
      </svg>
    ),
    text: "Search and manage patient records",
  },
  {
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <polyline points="3 13 8 13 10 8 14 18 16 13 21 13" />
      </svg>
    ),
    text: "Track vitals, conditions, and medications in one place",
  },
  {
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M6 3v6c0 4 3 5 3 9a3 3 0 0 1-6 0" />
        <path d="M18 3v6c0 4-3 5-3 9a3 3 0 0 0 6 0" />
        <line x1="6.5" y1="8" x2="17.5" y2="8" />
        <line x1="7.5" y1="13" x2="16.5" y2="13" />
      </svg>
    ),
    text: "Pharmacogenomic safety flags — genetics-aware medication guidance based on real clinical guidelines",
  },
  {
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="19" cy="6" r="2.5" />
        <circle cx="12" cy="18" r="2.5" />
        <line x1="7" y1="7" x2="10.2" y2="16" />
        <line x1="17" y1="7" x2="13.8" y2="16" />
      </svg>
    ),
    text: "Built on FHIR — a standard used for real healthcare interoperability",
  },
];

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
      <div className="login-info-panel">
        <p className="login-info-eyebrow">FHIR Patient App</p>
        <h2 className="login-info-title">A practitioner tool for patient records</h2>
        <p className="login-info-lead">
          Manage demographics, vitals, conditions, and medications — built on the
          FHIR healthcare data standard.
        </p>

        <ul className="login-info-features">
          {FEATURES.map(feature => (
            <li key={feature.text}>
              <span className="login-info-icon">{feature.icon}</span>
              <span>{feature.text}</span>
            </li>
          ))}
        </ul>

        <p className="login-info-note">
          Demo instance — uses synthetic patient data on a test FHIR server, not
          real patient information.
        </p>
      </div>

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
