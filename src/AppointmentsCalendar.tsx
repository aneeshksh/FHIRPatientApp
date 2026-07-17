import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAppointmentPatientId,
  listAppointmentsForPractitioner,
  type Appointment,
} from "./fhirAppointment";
import { formatName, listPatientsForPractitioner, type Patient } from "./fhirPatient";
import { AppointmentForm } from "./AppointmentForm";
import { EncounterModal } from "./EncounterModal";

type AppointmentsCalendarProps = {
  practitionerId: string;
};

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRange(monthStart: Date): { start: string; end: string } {
  const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function AppointmentsCalendar({ practitionerId }: AppointmentsCalendarProps) {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [encounterTarget, setEncounterTarget] = useState<{
    patientId: string;
    appointmentId: string;
  } | null>(null);

  const patientsById = useMemo(
    () => new Map(patients.map(p => [p.id, p])),
    [patients],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { start, end } = monthRange(monthStart);
      const [appts, pts] = await Promise.all([
        listAppointmentsForPractitioner(practitionerId, start, end),
        listPatientsForPractitioner(practitionerId),
      ]);
      setAppointments(appts);
      setPatients(pts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load appointments");
    } finally {
      setLoading(false);
    }
  }, [practitionerId, monthStart]);

  useEffect(() => {
    load();
  }, [load]);

  const goToMonth = (delta: number) => {
    setMonthStart(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      if (!appt.start) continue;
      const key = toDateOnly(new Date(appt.start));
      const list = map.get(key) ?? [];
      list.push(appt);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const today = new Date();

  const patientNameFor = (appt: Appointment): string => {
    const pid = getAppointmentPatientId(appt);
    const patient = pid ? patientsById.get(pid) : undefined;
    return patient ? formatName(patient.name) : "Unknown patient";
  };

  return (
    <div className="patient-list">
      <div className="patient-list-header">
        <h1>Appointments</h1>
        <div className="patient-list-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowCreateForm(true)}
          >
            New appointment
          </button>
        </div>
      </div>

      <div className="calendar-nav">
        <button type="button" className="secondary-button" onClick={() => goToMonth(-1)}>
          ← Prev
        </button>
        <h2 className="calendar-month-label">
          {monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <button type="button" className="secondary-button" onClick={() => goToMonth(1)}>
          Next →
        </button>
      </div>

      {error && <p className="patient-list-error">{error}</p>}

      {loading ? (
        <p className="patient-list-status">Loading appointments…</p>
      ) : (
        <div className="calendar-grid">
          {WEEKDAYS.map(day => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
          {cells.map((date, i) => {
            const dayAppointments = date ? appointmentsByDay.get(toDateOnly(date)) ?? [] : [];
            return (
              <div
                key={date ? toDateOnly(date) : `empty-${i}`}
                className={`calendar-cell ${date ? "" : "calendar-cell-empty"} ${
                  date && sameDay(date, today) ? "calendar-cell-today" : ""
                }`}
              >
                {date && (
                  <>
                    <span className="calendar-cell-date">{date.getDate()}</span>
                    <div className="calendar-cell-appointments">
                      {dayAppointments.map(appt => (
                        <button
                          key={appt.id}
                          type="button"
                          className="calendar-appointment-chip"
                          onClick={() => setSelectedAppointment(appt)}
                        >
                          {appt.start
                            ? new Date(appt.start).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : ""}{" "}
                          {patientNameFor(appt)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateForm && (
        <AppointmentForm
          practitionerId={practitionerId}
          patients={patients}
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            load();
          }}
        />
      )}

      {selectedAppointment && (
        <div
          className="patient-form-overlay"
          onClick={() => setSelectedAppointment(null)}
        >
          <div
            className="patient-form-panel"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-detail-title"
          >
            <div className="patient-form-header">
              <h2 id="appointment-detail-title">Appointment</h2>
              <button
                type="button"
                className="patient-form-close"
                onClick={() => setSelectedAppointment(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <dl className="patient-demographics" style={{ gridTemplateColumns: "1fr" }}>
              <div>
                <dt>Patient</dt>
                <dd>{patientNameFor(selectedAppointment)}</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd>
                  {selectedAppointment.start
                    ? new Date(selectedAppointment.start).toLocaleString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span
                    className={`status-badge ${
                      selectedAppointment.status === "booked" ? "status-active" : "status-unknown"
                    }`}
                  >
                    {selectedAppointment.status}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="patient-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedAppointment(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const pid = getAppointmentPatientId(selectedAppointment);
                  if (pid && selectedAppointment.id) {
                    setEncounterTarget({ patientId: pid, appointmentId: selectedAppointment.id });
                    setSelectedAppointment(null);
                  }
                }}
              >
                Start encounter
              </button>
            </div>
          </div>
        </div>
      )}

      {encounterTarget && (
        <EncounterModal
          patientId={encounterTarget.patientId}
          practitionerId={practitionerId}
          appointmentId={encounterTarget.appointmentId}
          onClose={() => setEncounterTarget(null)}
          onSaved={() => setEncounterTarget(null)}
        />
      )}
    </div>
  );
}
