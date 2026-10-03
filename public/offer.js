const q = new URLSearchParams(location.search);
const base = `/api/offers/${encodeURIComponent(q.get("opening"))}/${encodeURIComponent(q.get("token"))}`;
const $ = (s) => document.querySelector(s);
const TITLES = {
  open: "An earlier appointment opened up!",
  accepted: "You're booked!",
  declined: "No problem",
  expired: "This offer has expired",
  unavailable: "No longer available",
};
let view;

function render(v) {
  view = v;
  $("#title").textContent = TITLES[v.state] ?? "Offer";
  if (v.service) {
    const when = new Date(v.startsAt).toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    $("#details").innerHTML = "";
    for (const [k, val] of [["Service", v.service], ["Stylist", v.stylist], ["When", when]]) {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = val;
      $("#details").append(dt, dd);
    }
  }
  $("#message").textContent = v.message;
  $("#buttons").hidden = v.state !== "open";
  document.querySelectorAll("#buttons button").forEach((b) => (b.disabled = false));
  tick();
}

function tick() {
  if (view?.state !== "open" || !view.expiresAt) return ($("#timer").textContent = "");
  const ms = Math.max(0, new Date(view.expiresAt) - Date.now());
  $("#timer").textContent = `Held for you for ${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  if (ms === 0) load();
}

async function load() {
  render(await (await fetch(base)).json());
}

async function respond(action) {
  document.querySelectorAll("#buttons button").forEach((b) => (b.disabled = true));
  render(await (await fetch(`${base}/${action}`, { method: "POST" })).json());
}

$("#accept").addEventListener("click", () => respond("accept"));
$("#decline").addEventListener("click", () => respond("decline"));
load();
setInterval(tick, 1000);
