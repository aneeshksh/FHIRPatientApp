import { PatientList } from "./PatientList";
import "./index.css";

export { PatientList } from "./PatientList";
export { PatientForm } from "./PatientForm";
export * from "./fhirPatient";

export function App() {
  return (
    <main className="app">
      <PatientList />
    </main>
  );
}

export default App;
