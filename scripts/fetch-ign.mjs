import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ENDPOINT = "https://mollusk.apis.ign.com/graphql";
const OBJECT_ID = "96dabe93-682c-4d61-9f49-e462af876af2";
const WIKI_PREFIX = "https://www.ign.com";

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

const CHECKLISTS = `query Checklists($objectId: ID!) {
  checklists(objectId: $objectId) { id name slug imageUrl taskCount category { id name } }
}`;

const CHECKLIST = `query Checklist($id: Int) {
  checklist(id: $id) {
    id slug name
    groups { id name }
    taskJoins { checklistTaskId checklistGroupId }
    tasks { id name mapUrl map { mapName } guidePages { title wikiUrl } }
  }
}`;

async function main() {
  const { checklists } = await gql(CHECKLISTS, { objectId: OBJECT_ID });
  const categories = [];

  for (const summary of checklists) {
    const { checklist } = await gql(CHECKLIST, { id: summary.id });
    const groupOf = new Map(
      (checklist.taskJoins || []).map((j) => [j.checklistTaskId, j.checklistGroupId])
    );

    const items = (checklist.tasks || []).map((task) => {
      const page = (task.guidePages || []).find((p) => p.wikiUrl);
      return {
        id: task.id,
        name: task.name,
        groupId: groupOf.get(task.id) ?? null,
        wikiUrl: page ? WIKI_PREFIX + page.wikiUrl : null,
        mapUrl: task.mapUrl ? WIKI_PREFIX + task.mapUrl : null,
        mapName: task.map?.mapName ?? null
      };
    });

    categories.push({
      id: checklist.id,
      slug: checklist.slug,
      name: checklist.name,
      category: summary.category?.name ?? null,
      imageUrl: summary.imageUrl ?? null,
      groups: (checklist.groups || []).map((g) => ({ id: g.id, name: g.name })),
      items
    });

    const missing = items.filter((it) => !it.wikiUrl).length;
    console.log(
      `  ${summary.slug.padEnd(28)} ${String(items.length).padStart(3)} pozycji, ${missing} bez linku`
    );
  }

  const total = categories.reduce((n, c) => n + c.items.length, 0);
  const out = { objectId: OBJECT_ID, fetchedAt: new Date().toISOString(), categories };

  const file = resolve(ROOT, "data", "ign.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nIGN: ${categories.length} kategorii, ${total} pozycji -> data/ign.json`);
}

main().catch((err) => {
  console.error("Blad pobierania IGN:", err.message);
  process.exit(1);
});
