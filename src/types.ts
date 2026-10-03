export type Service = "Haircut" | "Color" | "Blowout" | "Trim";

export type WaitlistClient = {
  id: string;
  name: string;
  phone: string;
  service: Service;
  // "Any" means the client has no stylist preference.
  stylist: string;
  // Days the client said they can come in, e.g. ["Sat", "Sun"].
  availableDays: string[];
  joinedAt: string;
  status: "waiting" | "booked";
};

export type Opening = {
  service: Service;
  stylist: string;
  startsAt: string;
};

export type FillOpeningInput = {
  openingId: string;
  opening: Opening;
  // How long each client has to answer before the offer moves on.
  offerWindowMinutes: number;
  // Stop offering this many minutes before the appointment.
  cutoffMinutes: number;
};

export type Candidate = Pick<WaitlistClient, "id" | "name" | "phone" | "joinedAt">;

export type OfferOutcome = "declined" | "timed_out" | "skipped" | "accepted";

export type OfferRecord = {
  clientId: string;
  name: string;
  outcome: OfferOutcome;
  at: string;
};

export type Notification = {
  at: string;
  to: string;
  channel: "SMS (simulated)" | "Front desk (simulated)";
  message: string;
  link?: string;
};

export type OpeningPhase =
  | "finding_candidates"
  | "offering"
  | "filled"
  | "cancelled"
  | "no_takers"
  | "past_cutoff";

export type OpeningStatus = {
  openingId: string;
  opening: Opening;
  phase: OpeningPhase;
  offerWindowMinutes: number;
  cutoffAt: string;
  currentOffer?: { clientId: string; name: string; token: string; expiresAt: string };
  history: OfferRecord[];
  remaining: Candidate[];
  bookedFor?: { name: string; how: "client_accepted" | "staff_booked" };
  closedReason?: string;
  notifications: Notification[];
};

// The only things a client is allowed to see: no names, no waitlist position.
export type ClientOfferView = {
  state: "open" | "expired" | "unavailable" | "accepted" | "declined";
  service: Service;
  stylist: string;
  startsAt: string;
  expiresAt?: string;
  message: string;
};
