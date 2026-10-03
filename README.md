# Juniper Salon: waitlist openings prototype

When a client cancels, staff create an **opening**. A Temporal Workflow then offers it to matching waitlist clients **one at a time** (matching service, stylist preference and day, longest-waiting first). Each client gets a no-account link to accept or decline within a set window (15 minutes for same-day openings). The Workflow stops trying 1 to 2 hours before the appointment.

- **No double-booking:** accept and decline are Temporal **Updates** with validators. Only the client currently holding the offer, inside their window, can claim it. Late, stale or repeated replies are rejected.
- **Nothing falls through the cracks:** each offer window is a durable **timer**, so the opening moves to the next client even if no one is watching and even if the API or Worker restarts.
- **Staff stay in control:** Skip, Cancel outreach and Book by hand are **Signals**. The dashboard reads live state through a **Query** (who holds the offer, time left, who declined or timed out, who's next).
- **Notifications** (client texts and front-desk alerts) are **Activities** with retries.

**Simulated:** SMS and front-desk notifications are logged, not sent; the Google Sheet waitlist is `data/waitlist.json`; staff still add the booking to Square by hand. **Not included:** staff login, adding clients to the waitlist from the UI, Square integration.

Run `npm run dev`, open <http://localhost:3000> (staff) and use the "Open the client's offer link" links to act as the client. `npm test` covers timeout, decline, cancel and first-acceptance-wins.

---

# Temporal post-assessment starter

This repository provides a working local Temporal environment, API, Worker, and browser interface. The included neutral demo is intentionally unrelated to the customer’s final process. Use what you learn in the customer conversation to replace it.

## Important: create a new public repository—do not fork

Your submission must be in a brand-new **public** GitHub repository. **Do not use GitHub’s Fork button.** Forks connect submissions through GitHub’s fork network and can make other participants’ work easier to locate.

Do not add `john-b-yang` or `vishakhpk` as collaborators. Because the repository is public, the assessment team can review it without write access.

Before the timed assessment:

1. Create a new **public** repository in your assigned GitHub organization. Do not initialize it with a README.
2. Clone the starter:

   ```bash
   git clone <STARTER_REPOSITORY_URL> temporal-assessment
   cd temporal-assessment
   ```

3. Point the clone at your new repository:

   ```bash
   git remote remove origin
   git branch -M main
   git remote add origin git@github.com:<YOUR_ORGANIZATION>/<YOUR_REPOSITORY>.git
   git push -u origin main
   ```

4. Confirm that GitHub displays the **Public** label and does not say “forked from” another repository.

If you accidentally create a fork, do not push assessment work to it. Create a new public repository, change your local `origin`, and ask the course team to remove the fork. Do not search for or view other participants’ assessment repositories.

## Verify setup before the timed assessment

Requirements: Node.js 20 or newer and Docker Desktop.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, run the demo, and confirm that it completes. You can inspect it in the Temporal Web UI at <http://localhost:8233>. Setup time does not count toward the assessment.

Other commands:

```bash
npm test          # Run the starter Workflow test without Docker
npm run typecheck # Check TypeScript
npm run stop      # Stop the local Temporal service
```

## Repository map

- `src/workflows.ts` — durable Workflow logic and message handlers
- `src/worker.ts` — Worker and Task Queue configuration
- `src/api.ts` — browser-facing API and Temporal Client
- `src/types.ts` — shared data types
- `public/` — customer-facing interface
- `tests/` — Workflow test example

You may change any application file. Do not edit generated files in `node_modules`.

## Documentation

- [TypeScript developer guide](https://docs.temporal.io/develop/typescript)
- [Workflows](https://docs.temporal.io/workflows)
- [Activities](https://docs.temporal.io/activities)
- [Signals, Queries, and Updates](https://docs.temporal.io/encyclopedia/workflow-message-passing)
