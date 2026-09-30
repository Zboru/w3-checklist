import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../scripts/lib/csv.mjs";

test("parsuje cytowane pola z przecinkami i nowymi liniami", () => {
  const rows = parseCsv('a,b\n"x,1","y\n2"\n');
  assert.deepEqual(rows, [["a", "b"], ["x,1", "y\n2"]]);
});

test("obsługuje podwójne cudzysłowy", () => {
  const rows = parseCsv('"a""b",c\nd\n');
  assert.deepEqual(rows, [['a"b', "c"], ["d"]]);
});

test("krótkie wiersze nie są sztucznie dopełniane", () => {
  const rows = parseCsv("a\nb,c,d,e\n");
  assert.deepEqual(rows, [["a"], ["b", "c", "d", "e"]]);
});

test("pomija CR i nie tworzy pustego wiersza na końcu", () => {
  const rows = parseCsv("a,b\r\nc,d\r\n");
  assert.deepEqual(rows, [["a", "b"], ["c", "d"]]);
});
