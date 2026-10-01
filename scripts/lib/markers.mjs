import { EXTRA_TYPES } from "../../src/core.js";

/**
 * Wybiera znaczniki mapy do zapisania: powiązane z checklistą (matchedIds)
 * oraz extra POI/znajdźki z dozwolonych typów. Extra znaczniki dostają
 * `taskId: null`, dzięki czemu build wie, że ma je zachować.
 *
 * @param {Array<object>} raw surowe znaczniki z MapGenie
 * @param {Set<string>} matchedIds id znaczników powiązanych z checklistą
 * @param {Set<string>} [extraTypes]
 * @returns {Array<object>}
 */
export function selectMarkers(raw, matchedIds, extraTypes = EXTRA_TYPES) {
  const out = [];
  for (const mk of raw || []) {
    const matched = matchedIds.has(String(mk.id));
    const extra = !matched && extraTypes.has(String(mk.typeSlug));
    if (!matched && !extra) continue;
    out.push({ ...mk, taskId: matched ? String(mk.checklistTaskId) : null });
  }
  return out;
}
