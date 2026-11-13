// A rule can name who may set it off: a gate that looks at nothing an event carries but the source that sent it, so words
// inside an event never widen who may start work. Failure cases: a source not allowed still starts a run (which would let
// anyone holding any source key dispatch work); an allowed source is refused too (the gate turning into an outage); a
// rule that names nobody takes nothing (a typo silently stopping a pipeline); a source listed twice, or one that isn't
// registered at all.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empty, evolve, rows } from "../kernel/evolve.ts";
import { decide } from "../kernel/decide.ts";
import { parseRules, RulesError } from "../protocol/rules.ts";

const environment = { secret: "simulation-secret", publicUrl: "https://hub.test" };
const fixture = JSON.parse(readFileSync(new URL("./rules.fixture.json", import.meta.url), "utf8"));
const seeded = (file: unknown) => {
  const rules = parseRules(JSON.stringify(file), 0, "UTC");
  return evolve(empty(), decide(empty(), { type: "rules", args: [rules] }, 1, environment).facts);
};

/** The fixture with 「告警」 taking app's alarms, gated to these sources when one is given. */
function gated(actors: string[] | undefined) {
  const file = structuredClone(fixture);
  const rule = file.rules.find((candidate: any) => candidate.name === "告警");
  rule.when = { source: "app", types: ["alarm.*"] };
  if (actors !== undefined) rule.actors = actors;
  return file;
}

const from = (view: ReturnType<typeof seeded>, source: string, id: string) =>
  decide(view, { type: "ingest", args: [source, { id, type: "alarm.raised", subject: id }] }, 1000, environment).value;

test("actors: only a source a rule names may set it off", () => {
  // Failure this guards: any source holding a key can dispatch work to a rule meant for one caller.
  const view = seeded(gated(["app"]));
  assert.deepEqual(from(view, "app", "one").routed, ["告警"], "the source the rule names starts it");

  // Another registered source sending the same event type is refused, and its event is still recorded: the hub says what
  // arrived, it just doesn't act on it.
  const other = decide(
    view,
    { type: "ingest", args: ["ops", { id: "two", type: "alarm.raised", subject: "two" }] },
    1000,
    environment,
  );
  assert.deepEqual(other.value.routed, [], "a source the rule didn't name starts nothing");
  assert.equal(rows(evolve(view, other.facts), "events").length, 1, "the event is still a fact");
});

test("actors: a rule that names nobody is the rule it always was", () => {
  const view = seeded(gated(undefined));
  assert.deepEqual(from(view, "app", "one").routed, ["告警"], "with no gate the rule takes its source as before");
  // The gate only ever narrows: a rule whose when names app still takes nothing from ops, with or without actors.
  assert.deepEqual(from(view, "ops", "two").routed, [], "a source the rule's when doesn't name is still not taken");
});

test("actors: an empty list is a mistake, not a rule nothing can start", () => {
  // Failure this guards: an empty list silently meaning "everyone", so a gate meant to close a rule leaves it open.
  assert.throws(() => seeded(gated([])), RulesError);
});

test("actors: a source that isn't registered is refused, by name and with the rule's", () => {
  assert.throws(
    () => seeded(gated(["app", "nowhere"])),
    (error: any) => {
      assert.ok(error instanceof RulesError);
      return error.issues.some((issue: string) => issue.includes("nowhere") && issue.includes("告警"));
    },
  );
});

test("actors: the same source listed twice is a mistake, not a wider gate", () => {
  assert.throws(() => seeded(gated(["app", "app"])), RulesError);
});
