import { useCallback, useEffect, useState } from "react";
import { PatientDetail } from "./PatientDetail";
import { PatientList } from "./PatientList";
import { LoginPage } from "./LoginPage";
import { AdminPanel } from "./AdminPanel";
import { AppointmentsCalendar } from "./AppointmentsCalendar";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { fetchCurrentUser, logout as logoutRequest, type PublicUser } from "./authClient";
import "./index.css";

export { PatientList } from "./PatientList";
export { PatientForm } from "./PatientForm";
export { PatientDetail } from "./PatientDetail";
export * from "./fhirPatient";

function parsePatientId(pathname: string): string | null {
  const match = pathname.match(/^\/patient\/([^/]+)\/?$/);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : null;
}

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    fetchCurrentUser().then(setUser);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    setPathname(path);
  }, []);

  const handleLogout = async () => {
    await logoutRequest();
    setUser(null);
    navigate("/");
  };

  if (user === undefined) {
    return <main className="app" />;
  }

  if (user === null) {
    return <LoginPage onLoginSuccess={setUser} />;
  }

  const patientId = parsePatientId(pathname);
  const isAppointmentsView = pathname === "/appointments";

  return (
    <main className="app">
      <div className="app-topbar">
        {user.role === "practitioner" && user.fhir_practitioner_id && (
          <nav className="view-toggle app-topbar-nav">
            <button
              type="button"
              className={`toggle-button ${!isAppointmentsView ? "active" : ""}`}
              onClick={() => navigate("/")}
            >
              Patients
            </button>
            <button
              type="button"
              className={`toggle-button ${isAppointmentsView ? "active" : ""}`}
              onClick={() => navigate("/appointments")}
            >
              Appointments
            </button>
          </nav>
        )}
        <span className="app-topbar-user">
          {user.full_name} <span className="role-badge">{user.role}</span>
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowChangePassword(true)}
        >
          Change password
        </button>
        <button type="button" className="secondary-button" onClick={handleLogout}>
          Log out
        </button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      {user.role === "admin" ? (
        <AdminPanel />
      ) : !user.fhir_practitioner_id ? (
        <p className="patient-list-error">
          Your account has no linked FHIR Practitioner record. Contact an admin.
        </p>
      ) : isAppointmentsView ? (
        <AppointmentsCalendar practitionerId={user.fhir_practitioner_id} />
      ) : patientId ? (
        <PatientDetail
          patientId={patientId}
          practitionerId={user.fhir_practitioner_id}
          onBack={() => navigate("/")}
        />
      ) : (
        <PatientList
          practitionerId={user.fhir_practitioner_id}
          onSelectPatient={id => navigate(`/patient/${id}`)}
        />
      )}
    </main>
  );
}

export default App;
