const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (iso) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

const PHASE = {
  finding_candidates: ["Finding matches", "busy"],
  offering: ["Offering", "busy"],
  filled: ["Filled", "good"],
  cancelled: ["Cancelled", "muted"],
  no_takers: ["Not filled: no one left", "bad"],
  past_cutoff: ["Not filled: too close to appointment", "bad"],
};
const OUTCOME = { declined: "Declined", timed_out: "Timed out", skipped: "Skipped", accepted: "Accepted" };

// Default appointment time: today, about three hours from now, on the half hour.
const d = new Date(Date.now() + 3 * 3600_000);
d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
$("[name=startsAt]").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

async function api(url, body) {
  const res = await fetch(url, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

async function loadWaitlist() {
  const list = await api("/api/waitlist");
  $("#waitlist").innerHTML = `<tr><th>#</th><th>Client</th><th>Wants</th><th>Days</th></tr>` +
    list.map((c, i) => `<tr class="${c.status === "booked" ? "booked" : ""}">
      <td>${i + 1}</td>
      <td>${esc(c.name)}${c.status === "booked" ? ' <span class="pill good">booked</span>' : ""}</td>
      <td>${esc(c.service)}<br><small>${c.stylist === "Any" ? "any stylist" : "with " + esc(c.stylist)}</small></td>
      <td><small>${c.availableDays.length === 7 ? "Any day" : esc(c.availableDays.join(", "))}</small></td>
    </tr>`).join("");
}

function renderOpening(o) {
  const [label, tone] = PHASE[o.phase];
  const offer = o.currentOffer;
  const active = o.phase === "offering" || o.phase === "finding_candidates";
  return `<article class="card opening">
    <div class="row"><h2>${esc(o.opening.service)} with ${esc(o.opening.stylist)} · ${fmt(o.opening.startsAt)}</h2><span class="pill ${tone}">${label}</span></div>
    ${o.bookedFor ? `<p class="result good">Booked for <strong>${esc(o.bookedFor.name)}</strong> (${o.bookedFor.how === "client_accepted" ? "client accepted. Please add to Square" : "booked by staff"})</p>` : ""}
    ${o.closedReason && !o.bookedFor ? `<p class="result">${esc(o.closedReason)}</p>` : ""}
    ${offer ? `<div class="current"><div><small>Has the offer now</small><strong>${esc(offer.name)}</strong></div><div class="countdown" data-expires="${offer.expiresAt}"></div></div>` : ""}
    ${active ? `<div class="actions">
      <button data-act="skip" data-id="${o.openingId}" ${offer ? "" : "disabled"}>Skip to next client</button>
      <button data-act="book" data-id="${o.openingId}" class="secondary">Book by hand</button>
      <button data-act="cancel" data-id="${o.openingId}" class="danger">Cancel outreach</button>
    </div>` : ""}
    <div class="cols">
      <div><h3>Already contacted</h3>${o.history.length ? `<ul>${o.history.map((h) => `<li>${esc(h.name)} <span class="pill ${h.outcome === "accepted" ? "good" : "muted"}">${OUTCOME[h.outcome]}</span> <small>${time(h.at)}</small></li>`).join("")}</ul>` : "<p class='empty'>No one yet</p>"}</div>
      <div><h3>Up next</h3>${o.remaining.length ? `<ol>${o.remaining.map((c) => `<li>${esc(c.name)}</li>`).join("")}</ol>` : "<p class='empty'>No one left</p>"}</div>
    </div>
    <details ${active ? "open" : ""}><summary>Messages sent (simulated): ${o.notifications.length}</summary>
      <ul class="messages">${o.notifications.slice().reverse().map((n) => `<li><small>${time(n.at)} · ${esc(n.channel)} → ${esc(n.to)}</small><br>${esc(n.message)}${n.link ? ` <a href="${n.link}" target="_blank">Open the client's offer link ↗</a>` : ""}</li>`).join("")}</ul>
    </details>
  </article>`;
}

let lastHtml = "";
async function loadOpenings() {
  const openings = await api("/api/openings");
  if (!Array.isArray(openings) || !openings.length) return;
  const html = openings.map(renderOpening).join("");
  if (html !== lastHtml) {
    const open = [...document.querySelectorAll("#openings details")].map((x) => x.open);
    $("#openings").innerHTML = html;
    document.querySelectorAll("#openings details").forEach((x, i) => { if (open[i] !== undefined) x.open = open[i]; });
    lastHtml = html;
    loadWaitlist();
  }
  tick();
}

function tick() {
  document.querySelectorAll(".countdown").forEach((el) => {
    const ms = Math.max(0, new Date(el.dataset.expires).getTime() - Date.now());
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    el.innerHTML = `<small>Time left</small><strong>${m}:${String(s).padStart(2, "0")}</strong>`;
  });
}

$("#new-opening").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  f.startsAt = new Date(f.startsAt).toISOString();
  await api("/api/openings", f);
  setTimeout(loadOpenings, 400);
});

$("#openings").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const { act, id } = btn.dataset;
  if (act === "cancel") {
    const reason = prompt("Why are you cancelling? (e.g. stylist unavailable)", "Stylist unavailable");
    if (reason === null) return;
    await api(`/api/openings/${id}/cancel`, { reason });
  } else if (act === "book") {
    const name = prompt("Who did you book for this opening?");
    if (!name) return;
    await api(`/api/openings/${id}/book`, { name });
  } else {
    await api(`/api/openings/${id}/skip`, {});
  }
  loadOpenings();
});

$("#reset").addEventListener("click", async () => { await api("/api/waitlist/reset", {}); loadWaitlist(); });

loadWaitlist();
loadOpenings();
setInterval(() => loadOpenings().catch(console.error), 1500);
setInterval(tick, 1000);
