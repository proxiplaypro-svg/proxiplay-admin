import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("components/admin/ReliableDashboard.tsx", "utf8");
test("eight cards and accessible responsive daily charts are present", () => { for (const label of ["Joueurs inscrits", "Joueurs uniques hier", "Joueurs uniques", "Joueurs inactifs", "Parties jouées hier", "Parties jouées depuis le lancement", "Jeux en cours"]) assert.match(source, new RegExp(label)); assert.match(source, /Évolution de l’activité des joueurs/); assert.match(source, /Joueurs uniques par jour/); assert.match(source, /Parties jouées par jour/); assert.match(source, /\[7, 30, 90\]/); assert.match(source, /data-chart-tooltip/); assert.match(source, /min-\[420px\]:grid-cols-2/); assert.match(source, /xl:grid-cols-4/); assert.match(source, /aria-label="Période des graphiques"/); });
