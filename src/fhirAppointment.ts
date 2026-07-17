import type { Appointment, Bundle } from "fhir/r4";
import { extractFhirError } from "./fhirError";

export type { Appointment, Bundle };

export type CreateAppointmentParams = {
  patientId: string;
  practitionerId: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
};

function patientRef(appointment: Appointment): string | undefined {
  return appointment.participant.find(p =>
    p.actor?.reference?.startsWith("Patient/"),
  )?.actor?.reference;
}

export function getAppointmentPatientId(
  appointment: Appointment,
): string | undefined {
  return patientRef(appointment)?.split("/").pop();
}

export async function createAppointment(
  params: CreateAppointmentParams,
): Promise<Appointment> {
  const resource: Appointment = {
    resourceType: "Appointment",
    status: "booked",
    start: params.start,
    end: params.end,
    participant: [
      { actor: { reference: `Patient/${params.patientId}` }, status: "accepted" },
      {
        actor: { reference: `Practitioner/${params.practitionerId}` },
        status: "accepted",
      },
    ],
  };

  const res = await fetch("/fhir/Appointment", {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json" },
    body: JSON.stringify(resource),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      extractFhirError(errBody) ?? `Failed to create appointment (${res.status})`,
    );
  }

  return res.json();
}

export async function listAppointmentsForPractitioner(
  practitionerId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<Appointment[]> {
  const params = new URLSearchParams({
    actor: `Practitioner/${practitionerId}`,
    _count: "200",
  });
  params.append("date", `ge${rangeStart}`);
  params.append("date", `lt${rangeEnd}`);

  const res = await fetch(`/fhir/Appointment?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to load appointments (${res.status})`);
  }
  const bundle: Bundle<Appointment> = await res.json();
  return bundle.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];
}

export async function listAppointmentsForPatient(
  patientId: string,
): Promise<Appointment[]> {
  const res = await fetch(
    `/fhir/Appointment?patient=${patientId}&_count=50&_sort=-date`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load appointments (${res.status})`);
  }
  const bundle: Bundle<Appointment> = await res.json();
  return bundle.entry?.flatMap(e => (e.resource ? [e.resource] : [])) ?? [];
}
