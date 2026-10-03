# Juniper Salon: waitlist openings prototype

## Run it

Requirements: Node.js 20+ and Docker Desktop (running).

```bash
npm install && npm run dev
```

This starts the Temporal dev server (Docker), the Worker and the web app. Then open:

- Staff dashboard: <http://localhost:3000>
- Temporal Web UI: <http://localhost:8233>

To try it: create an opening (choose "1 minute (demo)" to see a timeout quickly), then use the "Open the client's offer link" links under *Messages sent* to accept or decline as the client. `npm test` runs the Workflow tests without Docker; `npm run stop` stops Temporal.

## What it does

When a client cancels, staff create an **opening**. A Temporal Workflow then offers it to matching waitlist clients **one at a time** (matching service, stylist preference and day, longest-waiting first). Each client gets a no-account link to accept or decline within a set window (15 minutes for same-day openings). The Workflow stops trying 1 to 2 hours before the appointment.

- **No double-booking:** accept and decline are Temporal **Updates** with validators. Only the client currently holding the offer, inside their window, can claim it. Late, stale or repeated replies are rejected.
- **Nothing falls through the cracks:** each offer window is a durable **timer**, so the opening moves to the next client even if no one is watching and even if the API or Worker restarts.
- **Staff stay in control:** Skip, Cancel outreach and Book by hand are **Signals**. The dashboard reads live state through a **Query** (who holds the offer, time left, who declined or timed out, who's next).
- **Notifications** (client texts and front-desk alerts) are **Activities** with retries.

**Simulated:** SMS and front-desk notifications are logged, not sent; the Google Sheet waitlist is `data/waitlist.json`; staff still add the booking to Square by hand. **Not included:** staff login, adding clients to the waitlist from the UI, Square integration.

`npm test` covers timeout, decline, cancel and first-acceptance-wins.

## Repository map

- `src/workflows.ts`: `fillOpeningWorkflow`, one Workflow per opening (timers, Updates, Signals, Query)
- `src/activities.ts`: candidate matching, simulated notifications, marking a client booked
- `src/api.ts`: staff and client API and Temporal Client
- `src/worker.ts`: Worker on the `juniper-waitlist` task queue
- `src/waitlist.ts`: simulated waitlist (sample data, created on first run)
- `public/index.html`: staff dashboard; `public/offer.html`: client offer page
- `tests/workflow.test.ts`: Workflow tests (time-skipping)

## Submission materials

- Presentation (5 slides): [`presentation/Juniper-Salon-Openings.pdf`](presentation/Juniper-Salon-Openings.pdf)
- Temporal Web UI evidence: [`evidence/temporal-workflow.png`](evidence/temporal-workflow.png)


## Temporal documentation

- [TypeScript developer guide](https://docs.temporal.io/develop/typescript)
- [Workflows](https://docs.temporal.io/workflows)
- [Activities](https://docs.temporal.io/activities)
- [Signals, Queries, and Updates](https://docs.temporal.io/encyclopedia/workflow-message-passing)
