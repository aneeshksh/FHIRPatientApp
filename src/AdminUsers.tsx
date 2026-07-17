import { useEffect, useState, type FormEvent } from "react";
import {
  createAdminUser,
  fetchUsers,
  setUserActive,
  type CreateUserValues,
  type PublicUser,
} from "./adminClient";

const emptyForm: CreateUserValues = {
  username: "",
  fullName: "",
  password: "",
  role: "practitioner",
};

function CreateUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (user: PublicUser) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<CreateUserValues>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof CreateUserValues, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const user = await createAdminUser(values);
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="patient-form-overlay" onClick={onCancel}>
      <div
        className="patient-form-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
      >
        <div className="patient-form-header">
          <h2 id="create-user-title">Add user</h2>
          <button
            type="button"
            className="patient-form-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="patient-form">
          <label>
            Full name *
            <input
              type="text"
              value={values.fullName}
              onChange={e => update("fullName", e.target.value)}
              disabled={saving}
              required
            />
          </label>

          <label>
            Username *
            <input
              type="text"
              value={values.username}
              onChange={e => update("username", e.target.value)}
              disabled={saving}
              required
            />
          </label>

          <label>
            Password *
            <input
              type="password"
              value={values.password}
              onChange={e => update("password", e.target.value)}
              disabled={saving}
              minLength={8}
              required
            />
          </label>

          <label>
            Role
            <select
              value={values.role}
              onChange={e => update("role", e.target.value)}
              disabled={saving}
            >
              <option value="practitioner">Practitioner</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {error && <p className="patient-form-error">{error}</p>}

          <div className="patient-form-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminUsers() {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async (user: PublicUser) => {
    setTogglingId(user.id);
    try {
      const updated = await setUserActive(user.id, user.is_active !== 1);
      setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <div className="detail-section-header">
        <h2>Users</h2>
        <button
          type="button"
          className="primary-button"
          onClick={() => setShowForm(true)}
        >
          Add user
        </button>
      </div>

      {error && <p className="patient-list-error">{error}</p>}

      {loading ? (
        <p className="patient-list-status">Loading users…</p>
      ) : (
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td>{user.username}</td>
                  <td>
                    <span className="role-badge">{user.role}</span>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${user.is_active ? "status-active" : "status-inactive"}`}
                    >
                      {user.is_active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td className="patient-actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => handleToggle(user)}
                      disabled={togglingId === user.id}
                    >
                      {user.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CreateUserForm
          onCancel={() => setShowForm(false)}
          onCreated={user => {
            setUsers(prev => [...prev, user]);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}
