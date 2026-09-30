import {
  emptyState,
  serializeState,
  parseState,
  computeProgress,
  nextStep,
  normalizeQuery
} from "./core.js";

const DATA = window.__DATA__ || { plan: [], collections: [], generatedAt: null };
const LS_KEY = "w3checklist.v1";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const planSteps = () => DATA.plan.flatMap((ch) => ch.steps);
const collectionItems = () => DATA.collections.flatMap((c) => c.items);
const allItems = () => [...planSteps(), ...collectionItems()];

const validIds = new Set(allItems().map((it) => it.id));

/** id -> [items], bo ten sam quest bywa w planie i w kolekcjach. */
const byId = new Map();
for (const item of allItems()) {
  if (!byId.has(item.id)) byId.set(item.id, []);
  byId.get(item.id).push(item);
}

let state = loadState();
let activeTab = "plan";
let currentNext = null;

/* ---------------- state ---------------- */

function loadState() {
  const fromHash = readHash();
  if (fromHash) {
    saveState(fromHash);
    return fromHash;
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return parseState(raw, validIds);
  } catch {
    /* localStorage niedostepny (tryb prywatny) */
  }
  return emptyState();
}

function readHash() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  try {
    const json = decodeURIComponent(escape(atob(m[1])));
    return parseState(json, validIds);
  } catch {
    return null;
  }
}

function saveState(next = state) {
  try {
    localStorage.setItem(LS_KEY, serializeState(next.done, next.notes));
  } catch {
    /* ignoruj */
  }
}

function isDone(id) {
  return state.done.has(id);
}

function setDone(id, value) {
  if (value) state.done.add(id);
  else state.done.delete(id);
  for (const item of byId.get(id) || []) syncRow(item, value);
  saveState();
  refresh();
}

function setNote(id, value) {
  if (value) state.notes[id] = value;
  else delete state.notes[id];
  saveState();
}

/* ---------------- rendering ---------------- */

const main = $("#main");
const planEl = document.createElement("div");
planEl.id = "plan";
const collectionsEl = document.createElement("div");
collectionsEl.id = "collections";
collectionsEl.hidden = true;
main.append(planEl, collectionsEl);

function itemVisible(item, q, hideDone) {
  if (hideDone && isDone(item.id)) return false;
  if (!q) return true;
  return normalizeQuery(`${item.namePl || ""} ${item.name || ""}`).includes(q);
}

function renderItem(item) {
  const li = document.createElement("li");
  li.className = "item" + (isDone(item.id) ? " done" : "");
  li.dataset.id = item.id;
  item._el = li;

  const label = document.createElement("label");
  label.className = "check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = isDone(item.id);
  cb.setAttribute("aria-label", `Odhacz: ${item.namePl || item.name}`);
  cb.addEventListener("change", () => setDone(item.id, cb.checked));
  label.append(cb);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "title";
  const pl = document.createElement("span");
  pl.className = "name-pl";
  pl.textContent = item.namePl || item.name;
  title.append(pl);
  if (item.namePl && item.namePl !== item.name) {
    const en = document.createElement("span");
    en.className = "name-en";
    en.textContent = item.name;
    title.append(en);
  }
  body.append(title);

  const meta = document.createElement("div");
  meta.className = "meta";
  if (item.level != null) {
    const chip = document.createElement("span");
    chip.className = "chip level";
    chip.textContent = `poz. ${item.level}`;
    meta.append(chip);
  }
  if (item.nonMissable) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "nieprzepadające";
    meta.append(chip);
  }
  if (item.wikiUrl) {
    const a = document.createElement("a");
    a.className = "link-ign";
    a.href = item.wikiUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "IGN ↗";
    meta.append(a);
  }
  const noteBtn = document.createElement("button");
  noteBtn.className = "note-btn";
  noteBtn.type = "button";
  noteBtn.textContent = state.notes[item.id] ? "notatka •" : "notatka";
  meta.append(noteBtn);
  body.append(meta);

  let tips = null;
  if (item.tips && item.tips.length) {
    tips = document.createElement("ul");
    tips.className = "tips";
    for (const t of item.tips) {
      const li2 = document.createElement("li");
      li2.textContent = t.replace(/^[-•]\s*/, "");
      tips.append(li2);
    }
    body.append(tips);
  }

  const note = document.createElement("textarea");
  note.className = "note";
  note.placeholder = "Własna notatka…";
  note.value = state.notes[item.id] || "";
  note.addEventListener("input", () => {
    setNote(item.id, note.value.trim());
    noteBtn.textContent = note.value.trim() ? "notatka •" : "notatka";
  });
  if (note.value) note.classList.add("open");
  noteBtn.addEventListener("click", () => note.classList.toggle("open"));
  body.append(note);

  li.append(label, body);
  return li;
}

function renderPlan() {
  planEl.textContent = "";
  for (const chapter of DATA.plan) {
    const h = document.createElement("h2");
    h.className = "chapter";
    h.innerHTML = `<span>${esc(chapter.region)}</span><span class="chapter-count"></span>`;
    chapter._el = h;
    planEl.append(h);
    const ul = document.createElement("ul");
    for (const step of chapter.steps) ul.append(renderItem(step));
    planEl.append(ul);
  }
}

function renderCollections() {
  collectionsEl.textContent = "";
  for (const cat of DATA.collections) {
    const h = document.createElement("h2");
    h.className = "chapter";
    h.innerHTML = `<span>${esc(cat.name)}</span><span class="chapter-count"></span>`;
    cat._el = h;
    collectionsEl.append(h);

    const byGroup = new Map();
    for (const item of cat.items) {
      const gid = item.groupId ?? null;
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid).push(item);
    }

    const groups = cat.groups && cat.groups.length ? cat.groups.slice() : [];
    const known = new Set(groups.map((g) => g.id));
    for (const gid of byGroup.keys()) {
      if (!known.has(gid)) groups.push({ id: gid, name: "Inne" });
    }

    for (const group of groups) {
      const items = byGroup.get(group.id);
      if (!items || !items.length) continue;
      if (groups.length > 1) {
        const gt = document.createElement("h3");
        gt.className = "group-title";
        gt.textContent = group.name;
        collectionsEl.append(gt);
      }
      const ul = document.createElement("ul");
      for (const item of items) ul.append(renderItem(item));
      collectionsEl.append(ul);
    }
  }
}

function renderAll() {
  renderPlan();
  renderCollections();
  refresh();
  syncHeaderHeight();
}

/* ---------------- updates ---------------- */

function syncRow(item, value) {
  const el = item._el;
  if (!el) return;
  el.classList.toggle("done", value);
  const cb = el.querySelector('input[type="checkbox"]');
  if (cb) cb.checked = value;
}

function chapterCounts() {
  for (const chapter of DATA.plan) {
    const p = computeProgress(chapter.steps, state.done);
    const span = chapter._el?.querySelector(".chapter-count");
    if (span) span.textContent = `${p.done}/${p.total}`;
  }
  for (const cat of DATA.collections) {
    const p = computeProgress(cat.items, state.done);
    const span = cat._el?.querySelector(".chapter-count");
    if (span) span.textContent = `${p.done}/${p.total}`;
  }
}

function applyFilter() {
  const q = normalizeQuery($("#search").value);
  const hideDone = $("#hideDone").checked;

  for (const chapter of DATA.plan) {
    let visible = 0;
    for (const step of chapter.steps) {
      const show = itemVisible(step, q, hideDone);
      if (step._el) step._el.hidden = !show;
      if (show) visible++;
    }
    if (chapter._el) chapter._el.classList.toggle("empty", visible === 0);
  }

  for (const cat of DATA.collections) {
    let visible = 0;
    for (const item of cat.items) {
      const show = itemVisible(item, q, hideDone);
      if (item._el) item._el.hidden = !show;
      if (show) visible++;
    }
    if (cat._el) cat._el.classList.toggle("empty", visible === 0);
  }
}

function updateProgress() {
  const items = activeTab === "plan" ? planSteps() : collectionItems();
  const p = computeProgress(items, state.done);
  $("#fill").style.width = p.percent + "%";
  $("#pct").textContent = p.percent + "%";
  $("#count").textContent = `${p.done}/${p.total}`;
}

function updateNext() {
  const n = nextStep(DATA.plan, state.done);
  currentNext = n;
  const btn = $("#nextBtn");
  btn.disabled = !n;
  if (n) {
    const label = n.step.namePl || n.step.name;
    btn.innerHTML = `Następny krok <span class="nowrap">→ ${esc(label)}</span>`;
  } else {
    btn.textContent = "Wszystko zrobione 🎉";
  }
}

function refresh() {
  chapterCounts();
  applyFilter();
  updateProgress();
  updateNext();
}

/* ---------------- tabs ---------------- */

function switchTab(name) {
  activeTab = name;
  planEl.hidden = name !== "plan";
  collectionsEl.hidden = name !== "collections";
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === name);
  $("#nextBtn").hidden = name !== "plan";
  refresh();
}

function syncHeaderHeight() {
  const top = document.querySelector(".top");
  if (top) document.documentElement.style.setProperty("--header-h", `${top.offsetHeight}px`);
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === activeTab);
}

window.addEventListener("resize", syncHeaderHeight);

for (const t of document.querySelectorAll(".tab")) {
  t.addEventListener("click", () => switchTab(t.dataset.tab));
}

/* ---------------- controls ---------------- */

$("#search").addEventListener("input", applyFilter);
$("#hideDone").addEventListener("change", applyFilter);
$("#showTips").addEventListener("change", (e) => document.body.classList.toggle("show-tips", e.target.checked));

$("#nextBtn").addEventListener("click", () => {
  if (!currentNext) return;
  switchTab("plan");
  const el = currentNext.step._el;
  if (!el) return;
  el.hidden = false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1200);
});

/* ---------------- menu ---------------- */

const menu = $("#menu");
const menuMsg = $("#menuMsg");

function openMenu(open) {
  menu.hidden = !open;
  $("#menuBtn").setAttribute("aria-expanded", String(open));
  if (open) {
    const planP = computeProgress(planSteps(), state.done);
    const colP = computeProgress(collectionItems(), state.done);
    $("#menuSummary").textContent = `Plan gry: ${planP.done}/${planP.total} (${planP.percent}%) · Kolekcje: ${colP.done}/${colP.total} (${colP.percent}%)`;
    menuMsg.textContent = "";
  }
}

$("#menuBtn").addEventListener("click", () => openMenu(menu.hidden));
$("#closeMenu").addEventListener("click", () => openMenu(false));
menu.addEventListener("click", (e) => {
  if (e.target === menu) openMenu(false);
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([serializeState(state.done, state.notes)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wiedzmin3-postep-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  menuMsg.textContent = "Wyeksportowano plik z postępem.";
});

$("#importInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const next = parseState(String(reader.result), validIds);
    state = next;
    saveState();
    renderAll();
    openMenu(true);
    menuMsg.textContent = `Zaimportowano: ${next.done.size} odhaczonych pozycji.`;
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("#shareBtn").addEventListener("click", async () => {
  const encoded = btoa(unescape(encodeURIComponent(serializeState(state.done, state.notes))));
  const url = `${location.origin}${location.pathname}#s=${encoded}`;
  try {
    await navigator.clipboard.writeText(url);
    menuMsg.textContent = "Skopiowano link z postępem.";
  } catch {
    menuMsg.textContent = url;
  }
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Wyczyścić cały postęp i notatki?")) return;
  state = emptyState();
  saveState();
  renderAll();
  openMenu(true);
  menuMsg.textContent = "Postęp wyczyszczony.";
});

/* ---------------- start ---------------- */

$("#generated").textContent = DATA.generatedAt
  ? `Wygenerowano ${new Date(DATA.generatedAt).toLocaleDateString("pl-PL")} · ${planSteps().length} kroków · ${collectionItems().length} pozycji kolekcji`
  : "";

renderAll();
