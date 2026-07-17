import { useState } from "react";
import { AdminUsers } from "./AdminUsers";
import { AdminPatients } from "./AdminPatients";

type Tab = "users" | "patients";

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="patient-list">
      <div className="patient-list-header">
        <h1>Admin</h1>
        <div className="view-toggle">
          <button
            type="button"
            className={`toggle-button ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            Users
          </button>
          <button
            type="button"
            className={`toggle-button ${tab === "patients" ? "active" : ""}`}
            onClick={() => setTab("patients")}
          >
            Patients
          </button>
        </div>
      </div>

      {tab === "users" ? <AdminUsers /> : <AdminPatients />}
    </div>
  );
}
