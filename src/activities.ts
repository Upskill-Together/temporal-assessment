import type { Candidate, Notification, Opening } from "./types";
import { readWaitlist, writeWaitlist } from "./waitlist";

const dayName = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short" });

// Same rule Lena and Carla use today: match service, availability and stylist
// preference, then start with whoever joined the waitlist earliest.
export async function findEligibleCandidates(opening: Opening): Promise<Candidate[]> {
  const day = dayName(opening.startsAt);
  return readWaitlist()
    .filter((c) => c.status === "waiting")
    .filter((c) => c.service === opening.service)
    .filter((c) => c.stylist === "Any" || c.stylist === opening.stylist)
    .filter((c) => c.availableDays.includes(day))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map(({ id, name, phone, joinedAt }) => ({ id, name, phone, joinedAt }));
}

// Simulated text message / front-desk alert. A real version would call an SMS
// provider here; Temporal retries this Activity if the provider is down.
export async function sendNotification(
  notification: Omit<Notification, "at">,
): Promise<Notification> {
  const sent = { ...notification, at: new Date().toISOString() };
  console.log(`[${sent.channel}] to ${sent.to}: ${sent.message}${sent.link ? ` ${sent.link}` : ""}`);
  return sent;
}

// Clients stay on the waitlist unless they accept an appointment.
export async function markClientBooked(clientId: string): Promise<void> {
  const clients = readWaitlist();
  writeWaitlist(
    clients.map((c) => (c.id === clientId ? { ...c, status: "booked" as const } : c)),
  );
}
