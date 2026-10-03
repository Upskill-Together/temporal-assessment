import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { WaitlistClient } from "./types";

// Simulated stand-in for Juniper Salon's Google Sheet. Both the API and the
// Worker read the same JSON file so the prototype behaves like one shared list.
const file = path.join(process.cwd(), "data", "waitlist.json");

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function seedWaitlist(): WaitlistClient[] {
  const all = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return [
    { id: "c1", name: "Maya Chen", phone: "(555) 201-1001", service: "Haircut", stylist: "Any", availableDays: all, joinedAt: daysAgo(21), status: "waiting" },
    { id: "c2", name: "Jordan Lee", phone: "(555) 201-1002", service: "Haircut", stylist: "Sam", availableDays: ["Sat", "Sun"], joinedAt: daysAgo(18), status: "waiting" },
    { id: "c3", name: "Priya Patel", phone: "(555) 201-1003", service: "Color", stylist: "Rosa", availableDays: all, joinedAt: daysAgo(15), status: "waiting" },
    { id: "c4", name: "Alex Rivera", phone: "(555) 201-1004", service: "Haircut", stylist: "Any", availableDays: all, joinedAt: daysAgo(12), status: "waiting" },
    { id: "c5", name: "Sofia Garcia", phone: "(555) 201-1005", service: "Blowout", stylist: "Any", availableDays: ["Fri", "Sat"], joinedAt: daysAgo(10), status: "waiting" },
    { id: "c6", name: "Ben Okafor", phone: "(555) 201-1006", service: "Haircut", stylist: "Rosa", availableDays: all, joinedAt: daysAgo(7), status: "waiting" },
    { id: "c7", name: "Hana Kim", phone: "(555) 201-1007", service: "Color", stylist: "Any", availableDays: all, joinedAt: daysAgo(5), status: "waiting" },
    { id: "c8", name: "Leo Martins", phone: "(555) 201-1008", service: "Haircut", stylist: "Any", availableDays: all, joinedAt: daysAgo(2), status: "waiting" },
  ];
}

export function readWaitlist(): WaitlistClient[] {
  if (!existsSync(file)) writeWaitlist(seedWaitlist());
  return JSON.parse(readFileSync(file, "utf8")) as WaitlistClient[];
}

export function writeWaitlist(clients: WaitlistClient[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(clients, null, 2));
}
