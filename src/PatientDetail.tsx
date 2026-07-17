import { useEffect, useState } from "react";
import type { Resource } from "fhir/r4";
import { ConditionsSection } from "./ConditionsSection";
import {
  formatBirthDateWithAge,
  formatGender,
  formatName,
  getPhone,
  type Bundle,
  type Patient,
} from "./fhirPatient";
import {
  parseVitalRows,
  type Condition,
  type Medication,
  type MedicationRequest,
  type Observation,
} from "./fhirClinical";
import { MedicationsSection } from "./MedicationsSection";
import { VitalsSection } from "./VitalsSection";
import { EncountersSection } from "./EncountersSection";
import { AppointmentsSection } from "./AppointmentsSection";
import { EncounterModal } from "./EncounterModal";
import { listEncountersForPatient, type Encounter } from "./fhirEncounter";
import { listAppointmentsForPatient, type Appointment } from "./fhirAppointment";

type PatientDetailProps = {
  patientId: string;
  practitionerId: string;
  onBack: () => void;
};

function entriesOf<T extends Resource>(bundle: Bundle<T> | null): T[] {
  return bundle?.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];
}

export function PatientDetail({ patientId, practitionerId, onBack }: PatientDetailProps) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [medicationRequests, setMedicationRequests] = useState<MedicationRequest[]>([]);
  const [medicationsById, setMedicationsById] = useState<Map<string, Medication>>(new Map());
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEncounterModal, setShowEncounterModal] = useState(false);

  const reloadEncounters = () => {
    listEncountersForPatient(patientId)
      .then(setEncounters)
      .catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [patientRes, obsRes, condRes, medReqRes, encounterList, appointmentList] =
          await Promise.all([
            fetch(`/fhir/Patient/${patientId}`),
            fetch(
              `/fhir/Observation?patient=${patientId}&category=vital-signs&_count=200&_sort=date`,
            ),
            fetch(`/fhir/Condition?patient=${patientId}&_count=100`),
            fetch(`/fhir/MedicationRequest?patient=${patientId}&_count=100`),
            listEncountersForPatient(patientId).catch(() => [] as Encounter[]),
            listAppointmentsForPatient(patientId).catch(() => [] as Appointment[]),
          ]);

        if (!patientRes.ok) {
          throw new Error(`Failed to load patient (${patientRes.status})`);
        }

        const patientData: Patient = await patientRes.json();
        const obsBundle: Bundle<Observation> | null = obsRes.ok ? await obsRes.json() : null;
        const condBundle: Bundle<Condition> | null = condRes.ok ? await condRes.json() : null;
        const medReqBundle: Bundle<MedicationRequest> | null = medReqRes.ok
          ? await medReqRes.json()
          : null;

        const obsEntries = entriesOf(obsBundle);
        const condEntries = entriesOf(condBundle);
        const medReqEntries = entriesOf(medReqBundle);

        const medicationIds = [
          ...new Set(
            medReqEntries
              .map(mr => mr.medicationReference?.reference?.split("/").pop())
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        const medications = await Promise.all(
          medicationIds.map(async id => {
            const res = await fetch(`/fhir/Medication/${id}`);
            return res.ok ? ((await res.json()) as Medication) : null;
          }),
        );

        if (cancelled) return;

        setPatient(patientData);
        setObservations(obsEntries);
        setConditions(condEntries);
        setMedicationRequests(medReqEntries);
        setMedicationsById(
          new Map(
            medications
              .filter((m): m is Medication => Boolean(m?.id))
              .map(m => [m.id!, m]),
          ),
        );
        setEncounters(encounterList);
        setAppointments(appointmentList);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load patient");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return (
      <div className="patient-detail">
        <button type="button" className="back-button" onClick={onBack}>
          ← Back to patients
        </button>
        <p className="patient-list-status">Loading patient…</p>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="patient-detail">
        <button type="button" className="back-button" onClick={onBack}>
          ← Back to patients
        </button>
        <p className="patient-list-error">{error ?? "Patient not found."}</p>
      </div>
    );
  }

  const vitalRows = parseVitalRows(observations);
  const phone = getPhone(patient);

  return (
    <div className="patient-detail">
      <button type="button" className="back-button" onClick={onBack}>
        ← Back to patients
      </button>

      <div className="patient-detail-header">
        <div className="detail-section-header">
          <h1>{formatName(patient.name)}</h1>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowEncounterModal(true)}
          >
            New encounter
          </button>
        </div>
        <dl className="patient-demographics">
          <div>
            <dt>Gender</dt>
            <dd>{formatGender(patient.gender)}</dd>
          </div>
          <div>
            <dt>Date of birth</dt>
            <dd>{formatBirthDateWithAge(patient.birthDate)}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{phone ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <VitalsSection rows={vitalRows} />
      <ConditionsSection conditions={conditions} />
      <MedicationsSection
        medicationRequests={medicationRequests}
        medicationsById={medicationsById}
      />
      <AppointmentsSection appointments={appointments} />
      <EncountersSection encounters={encounters} />

      {showEncounterModal && (
        <EncounterModal
          patientId={patientId}
          practitionerId={practitionerId}
          onClose={() => setShowEncounterModal(false)}
          onSaved={() => {
            setShowEncounterModal(false);
            reloadEncounters();
          }}
        />
      )}
    </div>
  );
}
