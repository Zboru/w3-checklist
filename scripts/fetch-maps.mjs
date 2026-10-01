import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { selectMarkers } from "./lib/markers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ENDPOINT = "https://mollusk.apis.ign.com/graphql";
const OBJECT_SLUG = "the-witcher-3-wild-hunt";

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "witcher-checklist/1.0" },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`IGN GraphQL ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`IGN GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const MAP_WIDGET = `query MapWidget($objectSlug: String!, $mapSlug: String!) {
  map(objectSlug: $objectSlug, mapSlug: $mapSlug, includeMapGenie: true, accessPremiumMap: false) {
    mapSlug mapName mapGenieGameId mapId premium
    initialZoom minZoom maxZoom initialLat initialLng tilesets backgroundColor
    types { typeSlug typeName markerCount }
  }
}`;

const MARKERS = `query MapGenieMarkersMultiple($mapGenieGameId: Int!, $mapId: Int!, $typeSlugs: [String!]!, $accessPremiumMap: Boolean) {
  mapGenieMarkersMultiple(mapGenieGameId: $mapGenieGameId, mapId: $mapId, typeSlugs: $typeSlugs, accessPremiumMap: $accessPremiumMap) {
    id lat lng markerName markerSlug typeSlug checklistTaskId
  }
}`;

function mapSlugFromUrl(url) {
  const m = String(url || "").match(/\/maps\/[^/]+\/([^?]+)/);
  return m ? m[1] : null;
}

async function main() {
  const ign = JSON.parse(await readFile(resolve(ROOT, "data", "ign.json"), "utf8"));

  // itemId -> slug mapy, oraz zbiór slugów
  const taskMapSlug = new Map();
  for (const cat of ign.categories) {
    for (const item of cat.items) {
      const slug = mapSlugFromUrl(item.mapUrl);
      if (slug) taskMapSlug.set(String(item.id), slug);
    }
  }
  const slugs = [...new Set(taskMapSlug.values())].sort();
  console.log(`Mapy do pobrania: ${slugs.length} (${slugs.join(", ")})`);
  console.log(`Pozycji z linkiem do mapy: ${taskMapSlug.size}`);

  const maps = [];
  let totalMarkers = 0;
  for (const slug of slugs) {
    const widget = (await gql(MAP_WIDGET, { objectSlug: OBJECT_SLUG, mapSlug: slug })).map;
    if (!widget) {
      console.warn(`  pomijam "${slug}" (brak danych mapy)`);
      continue;
    }
    if (widget.premium) {
      console.warn(`  pomijam "${slug}" (mapa premium)`);
      continue;
    }
    const typeSlugs = (widget.types || []).map((t) => t.typeSlug);
    const raw = (await gql(MARKERS, {
      mapGenieGameId: widget.mapGenieGameId,
      mapId: widget.mapId,
      typeSlugs,
      accessPremiumMap: false
    })).mapGenieMarkersMultiple || [];

    const typeName = Object.fromEntries((widget.types || []).map((t) => [t.typeSlug, t.typeName]));
    const matchedIds = new Set(
      raw.filter((mk) => taskMapSlug.get(String(mk.checklistTaskId)) === slug).map((mk) => String(mk.id))
    );
    const chosen = selectMarkers(raw, matchedIds);
    if (!chosen.length) {
      console.warn(`  "${slug}": brak znaczników do zapisania`);
      continue;
    }

    maps.push({
      slug,
      name: widget.mapName,
      tileUrl: (widget.tilesets || [])[0] || null,
      minZoom: widget.minZoom,
      maxZoom: widget.maxZoom,
      initialZoom: widget.initialZoom,
      initialLat: widget.initialLat,
      initialLng: widget.initialLng,
      backgroundColor: widget.backgroundColor || "#ffffff",
      types: (widget.types || []).map((t) => ({ slug: t.typeSlug, name: t.typeName })),
      markers: chosen.map((mk) => ({
        taskId: mk.taskId,
        lat: mk.lat,
        lng: mk.lng,
        name: mk.markerName,
        slug: mk.markerSlug,
        typeSlug: mk.typeSlug,
        typeName: typeName[mk.typeSlug] || mk.typeSlug
      }))
    });
    totalMarkers += chosen.length;
    console.log(`  ${slug.padEnd(26)} ${String(chosen.length).padStart(4)} znaczników (checklist: ${matchedIds.size}, z ${raw.length}) kafelki: ${(widget.tilesets || [])[0] ? "tak" : "brak"}`);
  }

  const out = { fetchedAt: new Date().toISOString(), attribution: "MapGenie / IGN", maps };
  const file = resolve(ROOT, "data", "maps.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nMapy: ${maps.length} regionów, ${totalMarkers} znaczników -> data/maps.json`);
}

main().catch((err) => {
  console.error("Blad pobierania map:", err.message);
  process.exit(1);
});
