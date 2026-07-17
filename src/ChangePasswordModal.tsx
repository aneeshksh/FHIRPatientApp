import { useState, type FormEvent } from "react";
import { changePassword } from "./authClient";

type ChangePasswordModalProps = {
  onClose: () => void;
};

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="patient-form-overlay" onClick={onClose}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <div className="patient-form-header">
          <h2 id="change-password-title">Change password</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {done ? (
          <div className="patient-form">
            <p>Password updated.</p>
            <div className="patient-form-actions">
              <button type="button" className="primary-button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="patient-form">
            <label>
              Current password *
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={saving}
                required
              />
            </label>

            <label>
              New password *
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                disabled={saving}
                required
              />
            </label>

            <label>
              Confirm new password *
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                disabled={saving}
                required
              />
            </label>

            {error && <p className="patient-form-error">{error}</p>}

            <div className="patient-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
