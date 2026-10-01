import {
  emptyState,
  serializeState,
  parseState,
  computeProgress,
  nextStep,
  normalizeQuery,
  isMissable,
  defaultEnabledTypes,
  isMarkerVisible,
  typeLabelPl
} from "./core.js";
import L from "leaflet";

const DATA = window.__DATA__ || { plan: [], collections: [], maps: [], generatedAt: null };
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

/** Mapy i znaczniki (puste przy buildzie z --no-map). */
const MAPS = (DATA.maps || []).filter((m) => m.tileUrl && m.markers.length);
const markerByItem = new Map();
for (const mp of MAPS) {
  for (const mk of mp.markers) {
    if (mk.itemId && !markerByItem.has(mk.itemId)) markerByItem.set(mk.itemId, { mapSlug: mp.slug, marker: mk });
  }
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
    return emptyState();
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
    localStorage.setItem(LS_KEY, serializeState(next.done));
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

/* ---------------- rendering ---------------- */

const main = $("#main");
const planEl = document.createElement("div");
planEl.id = "plan";
const collectionsEl = document.createElement("div");
collectionsEl.id = "collections";
collectionsEl.hidden = true;
const mapEl = document.createElement("div");
mapEl.id = "map";
mapEl.hidden = true;
main.append(planEl, collectionsEl, mapEl);

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

  const hasTips = Boolean(item.tips && item.tips.length);
  const title = document.createElement(hasTips ? "button" : "div");
  title.className = "title";
  if (hasTips) {
    title.type = "button";
    title.classList.add("has-tips");
    title.setAttribute("aria-expanded", "false");
  }
  const chevron = hasTips ? '<span class="chev" aria-hidden="true">▸</span>' : "";
  const pl = document.createElement("span");
  pl.className = "name-pl";
  pl.textContent = item.namePl || item.name;
  title.innerHTML = chevron;
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
  if (isMissable(item)) {
    const chip = document.createElement("span");
    chip.className = "chip missable";
    chip.textContent = "przepadające";
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
  if (item.mapUrl) {
    const inApp = MAPS.length > 0 && markerByItem.has(item.id);
    const a = document.createElement("a");
    a.className = "link-ign";
    a.href = item.mapUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = inApp ? "Na mapie" : "Mapa ↗";
    if (inApp) {
      a.dataset.marker = "1";
      a.addEventListener("click", (e) => {
        e.preventDefault();
        focusOnMap(item.id);
      });
    }
    meta.append(a);
  }
  body.append(meta);

  if (hasTips) {
    const tips = document.createElement("ul");
    tips.className = "tips";
    for (const t of item.tips) {
      const li2 = document.createElement("li");
      li2.textContent = t.replace(/^[-•]\s*/, "");
      tips.append(li2);
    }
    body.append(tips);
    title.addEventListener("click", () => {
      const open = tips.classList.toggle("open");
      title.classList.toggle("open", open);
      title.setAttribute("aria-expanded", String(open));
    });
  }

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
  const items = activeTab === "collections" ? collectionItems() : planSteps();
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

/* ---------------- mapa ---------------- */

const TYPE_COLORS = [
  "#d8b56b", "#8ec07c", "#e06c75", "#83a598", "#d3869b", "#fabd2f", "#b8bb26", "#fe8019", "#7dd3fc", "#c4b5fd"
];
const colorForType = (slug) => {
  let h = 0;
  for (const ch of String(slug)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TYPE_COLORS[h % TYPE_COLORS.length];
};

let leafletMap = null;
let currentMapSlug = null;
let pendingFocus = null;
let circles = new Map();
let enabledTypes = defaultEnabledTypes(MAPS.flatMap((m) => m.markers));
let renderedByType = new Map();
let currentMapTypeSlugs = [];

function renderMapRegions() {
  const bar = document.createElement("div");
  bar.className = "map-regions";
  bar.id = "mapRegions";
  for (const mp of MAPS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.slug = mp.slug;
    b.textContent = mp.name;
    b.addEventListener("click", () => selectMap(mp.slug));
    bar.append(b);
  }
  const wrap = document.createElement("div");
  wrap.className = "map-wrap";

  const canvas = document.createElement("div");
  canvas.id = "mapCanvas";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "mapFilterBtn";
  btn.className = "map-filter-btn";
  btn.setAttribute("aria-expanded", "false");
  btn.textContent = "Filtry";
  btn.addEventListener("click", () => toggleFilterPanel());

  const panel = document.createElement("div");
  panel.id = "mapFilterPanel";
  panel.className = "map-panel";
  panel.hidden = true;

  wrap.append(canvas, btn, panel);

  const note = document.createElement("p");
  note.className = "muted small map-note";
  note.textContent = "Kafelki pobierane online z serwera MapGenie. Pozycje bez znacznika nie mają odpowiednika na mapie.";
  mapEl.append(bar, wrap, note);
}

function toggleFilterPanel(force) {
  const btn = mapEl.querySelector("#mapFilterBtn");
  const panel = mapEl.querySelector("#mapFilterPanel");
  if (!btn || !panel) return;
  const open = typeof force === "boolean" ? force : panel.hidden;
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
}

function updateFilterButton() {
  const btn = mapEl.querySelector("#mapFilterBtn");
  if (!btn) return;
  const n = currentMapTypeSlugs.filter((s) => enabledTypes.has(s)).length;
  btn.textContent = `Filtry (${n})`;
}

/** Panel filtrów per typ: liczniki, polskie nazwy i przełączniki widoczności. */
function renderFilterPanel(mp) {
  const panel = mapEl.querySelector("#mapFilterPanel");
  panel.textContent = "";

  const counts = new Map();
  for (const mk of mp.markers) counts.set(String(mk.typeSlug), (counts.get(String(mk.typeSlug)) || 0) + 1);

  const entries = [];
  const seen = new Set();
  for (const t of mp.types) {
    const key = String(t.slug);
    if (!counts.has(key) || seen.has(key)) continue;
    seen.add(key);
    entries.push({ slug: key, name: t.name, count: counts.get(key) });
  }
  for (const [key, count] of counts) {
    if (seen.has(key)) continue;
    const known = mp.markers.find((mk) => String(mk.typeSlug) === key);
    entries.push({ slug: key, name: (known && known.typeName) || key, count });
  }
  currentMapTypeSlugs = entries.map((e) => e.slug);

  const list = document.createElement("div");
  list.className = "map-panel-list";
  for (const e of entries) {
    const label = document.createElement("label");
    label.className = "map-legend-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = enabledTypes.has(e.slug);
    cb.addEventListener("change", () => setTypeEnabled(e.slug, cb.checked));
    const i = document.createElement("i");
    i.style.background = colorForType(e.slug);
    label.append(cb, i, document.createTextNode(`${typeLabelPl(e.slug, e.name)} (${e.count})`));
    list.append(label);
  }

  const actions = document.createElement("div");
  actions.className = "map-panel-actions";
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "Wszystkie";
  all.addEventListener("click", () => setAllTypes(true));
  const none = document.createElement("button");
  none.type = "button";
  none.textContent = "Żadne";
  none.addEventListener("click", () => setAllTypes(false));
  actions.append(all, none);

  panel.append(list, actions);
  updateFilterButton();
}

function setAllTypes(on) {
  for (const slug of currentMapTypeSlugs) setTypeEnabled(slug, on);
  const mp = MAPS.find((m) => m.slug === currentMapSlug) || MAPS[0];
  if (mp) renderFilterPanel(mp);
}

function setTypeEnabled(slug, on) {
  const key = String(slug);
  if (on) enabledTypes.add(key);
  else enabledTypes.delete(key);
  for (const layer of renderedByType.get(key) || []) {
    if (on) layer.addTo(leafletMap);
    else layer.removeFrom(leafletMap);
  }
  updateFilterButton();
}

/** Popup znacznika bez powiązania z checklistą (POI/znajdźka). */
function popupTextFor(mk) {
  const type = typeLabelPl(mk.typeSlug, String(mk.typeName || "").trim());
  return type ? `${esc(mk.name)}<div class="map-pop-en">${esc(type)}</div>` : esc(mk.name);
}

function popupFor(item) {
  const box = document.createElement("div");
  box.className = "map-pop";

  const name = document.createElement("div");
  name.className = "map-pop-name";
  name.textContent = item.namePl || item.name;
  name.title = item.namePl && item.namePl !== item.name ? `${item.namePl} — ${item.name}` : item.name;
  box.append(name);

  if (item.namePl && item.namePl !== item.name) {
    const en = document.createElement("div");
    en.className = "map-pop-en";
    en.textContent = item.name;
    box.append(en);
  }

  const row = document.createElement("div");
  row.className = "map-pop-row";

  const label = document.createElement("label");
  label.className = "map-pop-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = isDone(item.id);
  cb.addEventListener("change", () => setDone(item.id, cb.checked));
  label.append(cb, document.createTextNode(" zrobione"));
  row.append(label);

  if (item.wikiUrl) {
    const a = document.createElement("a");
    a.href = item.wikiUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "IGN ↗";
    row.append(a);
  }

  box.append(row);
  return box;
}

function selectMap(slug) {
  const mp = MAPS.find((m) => m.slug === slug) || MAPS[0];
  if (!mp) return;
  currentMapSlug = mp.slug;

  for (const b of mapEl.querySelectorAll(".map-regions button")) {
    b.classList.toggle("active", b.dataset.slug === mp.slug);
  }
  renderFilterPanel(mp);

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }
  circles = new Map();
  const canvas = mapEl.querySelector("#mapCanvas");
  leafletMap = L.map(canvas, {
    minZoom: Math.max(1, (mp.minZoom || 2)),
    maxZoom: mp.maxZoom || 17,
    zoomControl: true,
    attributionControl: true
  });
  L.tileLayer(mp.tileUrl, {
    minZoom: mp.minZoom || 2,
    maxZoom: mp.maxZoom || 17,
    attribution: "MapGenie / IGN",
    maxNativeZoom: mp.maxZoom || 17
  }).addTo(leafletMap);

  const bounds = L.latLngBounds(mp.markers.map((mk) => [mk.lat, mk.lng]));
  renderedByType = new Map();
  for (const mk of mp.markers) {
    const [item] = byId.get(mk.itemId) || [];
    const marker = L.circleMarker([mk.lat, mk.lng], {
      radius: 7,
      color: "#10131a",
      weight: 2,
      fillColor: colorForType(mk.typeSlug),
      fillOpacity: 1
    });
    if (item) {
      marker.bindPopup(() => popupFor(item), { minWidth: 150, maxWidth: 220, autoPanPadding: [12, 12] });
      circles.set(mk.itemId, marker);
    } else {
      marker.bindPopup(popupTextFor(mk), { minWidth: 120 });
    }
    const key = String(mk.typeSlug);
    if (!renderedByType.has(key)) renderedByType.set(key, []);
    renderedByType.get(key).push(marker);
    if (isMarkerVisible(mk, enabledTypes)) marker.addTo(leafletMap);
  }
  leafletMap.fitBounds(bounds.pad(0.18));
  applyMapFocus();
}

function applyMapFocus() {
  if (!pendingFocus || !leafletMap) return;
  const marker = circles.get(pendingFocus);
  pendingFocus = null;
  if (!marker) return;
  leafletMap.setView(marker.getLatLng(), Math.max(leafletMap.getZoom(), 13));
  marker.openPopup();
}

function focusOnMap(itemId) {
  const hit = markerByItem.get(itemId);
  if (!hit) return false;
  switchTab("map");
  selectMap(hit.mapSlug);
  pendingFocus = itemId;
  applyMapFocus();
  return true;
}

/* ---------------- tabs ---------------- */

function switchTab(name) {
  activeTab = name;
  planEl.hidden = name !== "plan";
  collectionsEl.hidden = name !== "collections";
  mapEl.hidden = name !== "map";
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === name);
  $("#nextBtn").hidden = name !== "plan";
  window.scrollTo(0, 0);
  if (name === "map") {
    if (!leafletMap && MAPS.length) selectMap(currentMapSlug || MAPS[0].slug);
    else if (leafletMap) leafletMap.invalidateSize();
  }
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
  const blob = new Blob([serializeState(state.done)], { type: "application/json" });
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
  const encoded = btoa(unescape(encodeURIComponent(serializeState(state.done))));
  const url = `${location.origin}${location.pathname}#s=${encoded}`;
  try {
    await navigator.clipboard.writeText(url);
    menuMsg.textContent = "Skopiowano link z postępem.";
  } catch {
    menuMsg.textContent = url;
  }
});

$("#resetBtn").addEventListener("click", () => {
  if (!confirm("Wyczyścić cały postęp?")) return;
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

if (MAPS.length) {
  $("#mapTab").hidden = false;
  $("#mapCredit").hidden = false;
  renderMapRegions();
}

renderAll();
