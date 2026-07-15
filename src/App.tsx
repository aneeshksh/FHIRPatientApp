import { useCallback, useEffect, useState } from "react";
import { PatientDetail } from "./PatientDetail";
import { PatientList } from "./PatientList";
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

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    setPathname(path);
  }, []);

  const patientId = parsePatientId(pathname);

  return (
    <main className="app">
      {patientId ? (
        <PatientDetail patientId={patientId} onBack={() => navigate("/")} />
      ) : (
        <PatientList onSelectPatient={id => navigate(`/patient/${id}`)} />
      )}
    </main>
  );
}

export default App;
