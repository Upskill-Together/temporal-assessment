import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import type * as activities from "../src/activities";
import type { FillOpeningInput, Notification, OpeningStatus } from "../src/types";
import {
  acceptOffer,
  cancelOutreach,
  declineOffer,
  fillOpeningWorkflow,
  getOpeningStatus,
} from "../src/workflows";

// Fresh environment per test so the time-skipping clock never carries over.
let env: TestWorkflowEnvironment;
beforeEach(async () => {
  env = await TestWorkflowEnvironment.createTimeSkipping();
});
afterEach(async () => {
  await env?.teardown();
});

const fakeActivities: typeof activities = {
  async findEligibleCandidates() {
    return ["Maya", "Alex", "Leo"].map((name, i) => ({
      id: `c${i}`, name, phone: "555", joinedAt: new Date(2026, 0, i + 1).toISOString(),
    }));
  },
  async sendNotification(n): Promise<Notification> {
    return { ...n, at: new Date().toISOString() };
  },
  async markClientBooked() {},
};

function input(id: string): FillOpeningInput {
  return {
    openingId: id,
    opening: { service: "Haircut", stylist: "Sam", startsAt: new Date(Date.now() + 30 * 86_400_000).toISOString() },
    offerWindowMinutes: 15,
    cutoffMinutes: 90,
  };
}

async function run(id: string, body: (handle: Awaited<ReturnType<typeof env.client.workflow.start>>) => Promise<void>) {
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue: "test",
    workflowsPath: require.resolve("../src/workflows"),
    activities: fakeActivities,
  });
  await worker.runUntil(async () => {
    const handle = await env.client.workflow.start(fillOpeningWorkflow, { workflowId: id, taskQueue: "test", args: [input(id)] });
    await body(handle);
  });
}

async function offerFor(handle: { query: (q: typeof getOpeningStatus) => Promise<OpeningStatus> }, name: string) {
  for (let i = 0; i < 50; i++) {
    const s = await handle.query(getOpeningStatus);
    if (s.currentOffer?.name === name) return s.currentOffer;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${name} never received the offer: ${JSON.stringify(await handle.query(getOpeningStatus))}`);
}

test("offers one client at a time, moves on after 15 minutes, and only one acceptance wins", async () => {
  await run("timeout-then-accept", async (handle) => {
    const maya = await offerFor(handle, "Maya");

    await env.sleep("16 minutes"); // Maya doesn't answer
    const alex = await offerFor(handle, "Alex");

    await assert.rejects(handle.executeUpdate(acceptOffer, { args: [maya.token] }), "late reply must not claim the slot");
    const view = await handle.executeUpdate(acceptOffer, { args: [alex.token] });
    assert.equal(view.state, "accepted");

    const result = (await handle.result()) as OpeningStatus;
    assert.equal(result.phase, "filled");
    assert.equal(result.bookedFor?.name, "Alex");
    assert.deepEqual(result.history.map((h) => [h.name, h.outcome]), [["Maya", "timed_out"], ["Alex", "accepted"]]);
    await assert.rejects(handle.executeUpdate(acceptOffer, { args: [alex.token] }), "no second claim after filled");
  });
});

test("a decline goes straight to the next client, and staff can cancel", async () => {
  await run("decline-then-cancel", async (handle) => {
    const maya = await offerFor(handle, "Maya");
    await handle.executeUpdate(declineOffer, { args: [maya.token] });
    await offerFor(handle, "Alex");
    await handle.signal(cancelOutreach, "Stylist unavailable");
    const result = (await handle.result()) as OpeningStatus;
    assert.equal(result.phase, "cancelled");
    assert.equal(result.closedReason, "Stylist unavailable");
    assert.equal(result.history[0].outcome, "declined");
  });
});
