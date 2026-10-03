import {
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import type {
  ClientOfferView,
  FillOpeningInput,
  Notification,
  OpeningStatus,
} from "./types";

const { findEligibleCandidates, sendNotification, markClientBooked } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30 seconds",
    retry: { initialInterval: "2 seconds", maximumAttempts: 10 },
  });

// Staff dashboard
export const getOpeningStatus = defineQuery<OpeningStatus>("getOpeningStatus");
export const skipCurrent = defineSignal("skipCurrent");
export const cancelOutreach = defineSignal<[string]>("cancelOutreach");
export const bookManually = defineSignal<[string]>("bookManually");

// Client offer page (identified only by an unguessable per-offer token)
export const getClientOffer = defineQuery<ClientOfferView, [string]>("getClientOffer");
export const acceptOffer = defineUpdate<ClientOfferView, [string]>("acceptOffer");
export const declineOffer = defineUpdate<ClientOfferView, [string]>("declineOffer");

const NOT_AVAILABLE = "Sorry, this offer has expired or the appointment is no longer available.";

// One Workflow per cancelled appointment. It offers the opening to one
// matching client at a time, so two people can never both claim it.
export async function fillOpeningWorkflow(input: FillOpeningInput): Promise<OpeningStatus> {
  const { opening, offerWindowMinutes, cutoffMinutes } = input;
  const cutoffAtMs = new Date(opening.startsAt).getTime() - cutoffMinutes * 60_000;
  const status: OpeningStatus = {
    openingId: input.openingId,
    opening,
    phase: "finding_candidates",
    offerWindowMinutes,
    cutoffAt: new Date(cutoffAtMs).toISOString(),
    history: [],
    remaining: [],
    notifications: [],
  };
  // token -> client, plus what that client did with it
  const offers = new Map<string, { clientId: string; outcome?: "accepted" | "declined" }>();
  let answered = false;
  let skipRequested = false;

  const when = new Date(opening.startsAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const details = `${opening.service} with ${opening.stylist}, ${when}`;
  const notify = async (n: Omit<Notification, "at">) => {
    status.notifications.push(await sendNotification(n));
  };

  const isLive = (token: string) =>
    status.phase === "offering" &&
    status.currentOffer?.token === token &&
    Date.now() < new Date(status.currentOffer.expiresAt).getTime();

  const clientView = (token: string): ClientOfferView => {
    const base = { service: opening.service, stylist: opening.stylist, startsAt: opening.startsAt };
    const offer = offers.get(token);
    if (offer?.outcome === "accepted")
      return { ...base, state: "accepted", message: "You're booked! The salon will confirm shortly." };
    if (offer?.outcome === "declined")
      return { ...base, state: "declined", message: "Thanks for letting us know. You're still on the waitlist." };
    if (offer && isLive(token))
      return { ...base, state: "open", expiresAt: status.currentOffer!.expiresAt, message: "This appointment is being held for you." };
    if (!offer) return { ...base, state: "unavailable", message: NOT_AVAILABLE };
    return { ...base, state: status.phase === "offering" ? "expired" : "unavailable", message: NOT_AVAILABLE };
  };

  setHandler(getOpeningStatus, () => status);
  setHandler(getClientOffer, clientView);

  // Validators reject late or stale replies before anything is recorded.
  const requireLive = (token: string) => {
    if (!isLive(token)) throw new Error(NOT_AVAILABLE);
  };
  setHandler(
    acceptOffer,
    (token) => {
      // Lock the opening immediately so nobody else can claim it.
      const offer = status.currentOffer!;
      offers.get(token)!.outcome = "accepted";
      status.history.push({ clientId: offer.clientId, name: offer.name, outcome: "accepted", at: new Date().toISOString() });
      status.bookedFor = { name: offer.name, how: "client_accepted" };
      status.phase = "filled";
      return clientView(token);
    },
    { validator: requireLive },
  );
  setHandler(
    declineOffer,
    (token) => {
      const offer = status.currentOffer!;
      offers.get(token)!.outcome = "declined";
      status.history.push({ clientId: offer.clientId, name: offer.name, outcome: "declined", at: new Date().toISOString() });
      answered = true;
      return clientView(token);
    },
    { validator: requireLive },
  );

  setHandler(skipCurrent, () => {
    if (status.phase !== "offering" || !status.currentOffer) return;
    skipRequested = true;
    answered = true;
  });
  setHandler(cancelOutreach, (reason) => {
    if (status.phase !== "offering" && status.phase !== "finding_candidates") return;
    status.phase = "cancelled";
    status.closedReason = reason || "Cancelled by staff";
  });
  setHandler(bookManually, (name) => {
    if (status.phase !== "offering" && status.phase !== "finding_candidates") return;
    status.phase = "filled";
    status.bookedFor = { name: name || "Booked by staff", how: "staff_booked" };
  });

  status.remaining = await findEligibleCandidates(opening);
  if (status.phase === "finding_candidates") status.phase = "offering";

  while (status.phase === "offering") {
    const msLeft = cutoffAtMs - Date.now();
    if (msLeft <= 0) {
      status.phase = "past_cutoff";
      status.closedReason = `Stopped ${cutoffMinutes} min before the appointment: too late for a client to get here.`;
      break;
    }
    const next = status.remaining.shift();
    if (!next) {
      status.phase = "no_takers";
      status.closedReason = "Everyone eligible on the waitlist was contacted.";
      break;
    }

    const windowMs = Math.min(offerWindowMinutes * 60_000, msLeft);
    const token = uuid4();
    offers.set(token, { clientId: next.id });
    status.currentOffer = {
      clientId: next.id,
      name: next.name,
      token,
      expiresAt: new Date(Date.now() + windowMs).toISOString(),
    };
    answered = false;
    skipRequested = false;
    await notify({
      to: `${next.name} ${next.phone}`,
      channel: "SMS (simulated)",
      message: `Juniper Salon: an opening for ${details} is available. Tap to accept or decline within ${Math.round(windowMs / 60_000)} min.`,
      link: `/offer.html?opening=${encodeURIComponent(input.openingId)}&token=${token}`,
    });

    // Durable timer: survives Worker/API restarts and fires even if no one is watching.
    const gotAnswer = await condition(() => answered || status.phase !== "offering", windowMs);
    if (status.phase !== "offering") break;

    const now = new Date().toISOString();
    status.currentOffer = undefined;
    if (skipRequested) {
      status.history.push({ clientId: next.id, name: next.name, outcome: "skipped", at: now });
      await notify({ to: `${next.name} ${next.phone}`, channel: "SMS (simulated)", message: "Juniper Salon: that opening has been offered to someone else. You're still on our waitlist." });
    } else if (!gotAnswer) {
      status.history.push({ clientId: next.id, name: next.name, outcome: "timed_out", at: now });
      await notify({ to: `${next.name} ${next.phone}`, channel: "SMS (simulated)", message: "Juniper Salon: the offer has expired. No worries, you're still on our waitlist." });
    }
  }

  // Wrap up: tell the people who need to know.
  const holder = status.currentOffer;
  status.currentOffer = undefined;
  if (status.phase === "filled" && status.bookedFor) {
    if (status.bookedFor.how === "client_accepted" && holder) {
      await markClientBooked(holder.clientId);
      await notify({ to: holder.name,channel: "SMS (simulated)", message: `Juniper Salon: you're confirmed for ${details}. See you then!` });
      await notify({ to: "Front desk", channel: "Front desk (simulated)", message: `FILLED: ${holder.name} accepted ${details}. Please add to Square.` });
    } else {
      if (holder) await notify({ to: holder.name, channel: "SMS (simulated)", message: `Juniper Salon: ${NOT_AVAILABLE.replace("Sorry, t", "T")} You're still on our waitlist.` });
      await notify({ to: "Front desk", channel: "Front desk (simulated)", message: `FILLED by staff: ${status.bookedFor.name}, ${details}.` });
    }
  } else if (status.phase === "cancelled") {
    if (holder) await notify({ to: holder.name, channel: "SMS (simulated)", message: `Juniper Salon: sorry, the ${opening.service} opening is no longer available. You're still on our waitlist.` });
    await notify({ to: "Front desk", channel: "Front desk (simulated)", message: `Outreach cancelled for ${details}: ${status.closedReason}` });
  } else {
    await notify({ to: "Front desk", channel: "Front desk (simulated)", message: `NOT FILLED: ${details}. ${status.closedReason}` });
  }
  return status;
}
