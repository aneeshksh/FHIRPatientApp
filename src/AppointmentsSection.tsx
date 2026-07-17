import type { Appointment } from "./fhirAppointment";

type AppointmentsSectionProps = { appointments: Appointment[] };

function formatDateTime(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AppointmentsSection({ appointments }: AppointmentsSectionProps) {
  const sorted = [...appointments].sort((a, b) =>
    (b.start ?? "").localeCompare(a.start ?? ""),
  );

  return (
    <section className="detail-section">
      <div className="detail-section-header">
        <h2>Appointments</h2>
      </div>

      {sorted.length === 0 ? (
        <p className="patient-list-status">No appointments recorded.</p>
      ) : (
        <ul className="condition-list">
          {sorted.map(appointment => (
            <li key={appointment.id} className="condition-item">
              <span className="condition-name">{formatDateTime(appointment.start)}</span>
              <span className={`status-badge status-${appointment.status === "booked" ? "active" : "unknown"}`}>
                {appointment.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
