import { PatientList } from "./PatientList";
import "./index.css";

export function App() {
  return (
    <div className="app">
      <h1>FHIR Patient App</h1>
      <PatientList />
    </div>
  );
}

export default App;
