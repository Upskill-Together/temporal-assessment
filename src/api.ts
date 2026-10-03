import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client, Connection, WorkflowUpdateFailedError } from "@temporalio/client";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ClientOfferView, FillOpeningInput, OpeningStatus, Service } from "./types";
import { readWaitlist, seedWaitlist, writeWaitlist } from "./waitlist";
import {
  acceptOffer,
  bookManually,
  cancelOutreach,
  declineOffer,
  fillOpeningWorkflow,
  getClientOffer,
  getOpeningStatus,
  skipCurrent,
} from "./workflows";

const TASK_QUEUE = "juniper-waitlist";
const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

let clientPromise: Promise<Client> | undefined;
function getClient(): Promise<Client> {
  clientPromise ??= Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  }).then((connection) => new Client({ connection, namespace: "default" }));
  return clientPromise;
}

// ---- Staff: waitlist (simulated Google Sheet) ----
app.get("/api/waitlist", (_request, response) => {
  response.json(readWaitlist());
});
app.post("/api/waitlist/reset", (_request, response) => {
  writeWaitlist(seedWaitlist());
  response.json(readWaitlist());
});

// ---- Staff: openings ----
app.post("/api/openings", async (request, response) => {
  const body = request.body as {
    service: Service;
    stylist: string;
    startsAt: string;
    offerWindowMinutes?: number;
    cutoffMinutes?: number;
  };
  const openingId = `opening-${randomUUID().slice(0, 8)}`;
  const input: FillOpeningInput = {
    openingId,
    opening: {
      service: body.service,
      stylist: body.stylist,
      startsAt: new Date(body.startsAt).toISOString(),
    },
    offerWindowMinutes: Number(body.offerWindowMinutes ?? 15),
    cutoffMinutes: Number(body.cutoffMinutes ?? 90),
  };
  const client = await getClient();
  await client.workflow.start(fillOpeningWorkflow, {
    workflowId: openingId,
    taskQueue: TASK_QUEUE,
    args: [input],
  });
  response.status(201).json({ openingId });
});

app.get("/api/openings", async (_request, response) => {
  const client = await getClient();
  const ids: string[] = [];
  for await (const wf of client.workflow.list({ query: `WorkflowType="fillOpeningWorkflow"` })) {
    ids.push(wf.workflowId);
    if (ids.length >= 10) break;
  }
  const statuses = await Promise.all(
    ids.map((id) =>
      client.workflow.getHandle(id).query(getOpeningStatus).catch(() => undefined),
    ),
  );
  response.json(statuses.filter((s): s is OpeningStatus => Boolean(s)));
});

app.post("/api/openings/:id/skip", async (request, response) => {
  const client = await getClient();
  await client.workflow.getHandle(request.params.id).signal(skipCurrent);
  response.status(202).json({ accepted: true });
});
app.post("/api/openings/:id/cancel", async (request, response) => {
  const client = await getClient();
  await client.workflow.getHandle(request.params.id).signal(cancelOutreach, String(request.body?.reason ?? ""));
  response.status(202).json({ accepted: true });
});
app.post("/api/openings/:id/book", async (request, response) => {
  const client = await getClient();
  await client.workflow.getHandle(request.params.id).signal(bookManually, String(request.body?.name ?? ""));
  response.status(202).json({ accepted: true });
});

// ---- Client: offer page (no account, no other clients' info) ----
async function clientView(id: string, token: string): Promise<ClientOfferView | undefined> {
  const client = await getClient();
  return client.workflow.getHandle(id).query(getClientOffer, token).catch(() => undefined);
}

app.get("/api/offers/:id/:token", async (request, response) => {
  const view = await clientView(request.params.id, request.params.token);
  if (!view) return response.status(404).json({ message: "This offer link isn't valid." });
  response.json(view);
});

for (const [action, update] of [["accept", acceptOffer], ["decline", declineOffer]] as const) {
  app.post(`/api/offers/:id/:token/${action}`, async (request, response) => {
    const { id, token } = request.params as { id: string; token: string };
    const client = await getClient();
    try {
      const view = await client.workflow.getHandle(id).executeUpdate(update, { args: [token] });
      response.json(view);
    } catch (error) {
      // Late, stale or duplicate replies are rejected by the Workflow: nobody can double-book.
      const view = await clientView(id, token);
      response.status(409).json(
        view ?? { state: "unavailable", message: error instanceof WorkflowUpdateFailedError ? error.message : "This appointment is no longer available." },
      );
    }
  });
}

app.use(
  (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected error",
    });
  },
);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Juniper Salon waitlist is available at http://localhost:${port}`));
