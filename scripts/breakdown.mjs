import { ROLL_OPTION, TERM_OPTION, loc, setting } from "./const.mjs";

/**
 * Turns an evaluated roll into a breakdown that names the source of every number it contains.
 */

const { DiceTerm, OperatorTerm, PoolTerm } = foundry.dice.terms;
const ParentheticalTerm = foundry.dice.terms.ParentheticalTerm ?? class {};
const FunctionTerm = foundry.dice.terms.FunctionTerm ?? class {};

/* -------------------------------------------- */

/**
 * Collect the dice results of a term, including the ones that were discarded by advantage, disadvantage or a reroll.
 * @param {RollTerm} term  Term to read.
 * @returns {{ result: string, classes: string }[]}
 */
function collectDice(term) {
  if ( term instanceof DiceTerm ) return term.getTooltipData().rolls ?? [];
  if ( term instanceof PoolTerm ) return term.rolls.flatMap(roll => roll.dice.flatMap(collectDice));
  // Critical scaling may wrap a group of terms in a parenthetical, and a formula may use a function such as `floor()`.
  if ( (term instanceof ParentheticalTerm) || (term instanceof FunctionTerm) ) {
    return (term.dice ?? term.roll?.dice ?? []).flatMap(collectDice);
  }
  return [];
}

/* -------------------------------------------- */

/**
 * Build a breakdown of a single roll, grouped by the source each number came from.
 * @param {BasicRoll} roll  An evaluated roll.
 * @returns {object}        Breakdown context for the templates.
 */
export function buildRollBreakdown(roll) {
  const meta = roll?.options?.[ROLL_OPTION];
  const segments = meta?.tagged ? meta.segments : null;
  if ( !roll?._evaluated ) return { entries: [], hasSources: false, total: 0 };
  return segments ? taggedBreakdown(roll, segments) : untaggedBreakdown(roll);
}

/* -------------------------------------------- */

/**
 * Build the breakdown of a roll whose terms carry source information.
 * @param {BasicRoll} roll     An evaluated roll.
 * @param {object[]} segments  Source descriptors stored on the roll.
 * @returns {object}
 */
function taggedBreakdown(roll, segments) {
  const buckets = new Map();
  let approximate = false;
  let sign = 1;
  let scaled = false;

  const bucketFor = index => {
    if ( !buckets.has(index) ) {
      const segment = segments[index];
      buckets.set(index, {
        dice: [],
        formula: segment?.formula ?? "",
        kind: segment?.kind ?? "bonus",
        label: segment?.label ?? loc("BCCC.Source.Flat"),
        order: Number.isInteger(index) ? index : segments.length,
        value: 0
      });
    }
    return buckets.get(index);
  };

  for ( const term of roll.terms ) {
    if ( term instanceof OperatorTerm ) {
      if ( term.operator === "+" ) {
        sign = 1;
        scaled = false;
      } else if ( term.operator === "-" ) {
        sign = -1;
        scaled = false;
      } else {
        scaled = true;
        approximate = true;
      }
      continue;
    }

    const index = term.options?.[TERM_OPTION];
    const bucket = bucketFor(Number.isInteger(index) ? index : "extra");
    if ( !Number.isInteger(index) ) {
      bucket.label = roll.options?.isCritical ? loc("BCCC.Source.CriticalBonus") : loc("BCCC.Source.Flat");
      bucket.order = segments.length;
    }
    bucket.dice.push(...collectDice(term));
    const value = Number(term.total);
    if ( Number.isFinite(value) ) bucket.value += value * sign;
    if ( scaled ) bucket.approximate = true;
  }

  const entries = Array.from(buckets.values())
    .filter(entry => entry.dice.length || entry.value)
    .sort((lhs, rhs) => lhs.order - rhs.order);

  return {
    approximate,
    entries,
    hasSources: entries.length > 0,
    total: roll.total
  };
}

/* -------------------------------------------- */

/**
 * Build a plain breakdown for rolls that carry no source information, so the card still shows the dice and bonuses.
 * @param {BasicRoll} roll  An evaluated roll.
 * @returns {object}
 */
function untaggedBreakdown(roll) {
  const entries = roll.dice.map(die => {
    const data = die.getTooltipData();
    return {
      dice: data.rolls ?? [],
      formula: data.formula,
      kind: "dice",
      label: data.flavor || data.formula || loc("BCCC.Source.Dice"),
      value: die.total
    };
  });

  let constants = [];
  try {
    const ast = CONFIG.Dice.parser.toAST(roll.clone().terms);
    constants = roll.constructor.collectConstants?.(ast)?.filter(({ flavor, total }) => flavor || total) ?? [];
  } catch(err) {
    constants = [];
  }

  for ( const { flavor, total } of constants ) {
    entries.push({ dice: [], formula: String(total), kind: "bonus", label: flavor || loc("BCCC.Source.Flat"), value: total });
  }

  return { approximate: false, entries, hasSources: false, total: roll.total };
}

/* -------------------------------------------- */

/**
 * Describe how a d20 roll was made: with advantage, with disadvantage or straight, which die was kept and which ones
 * were dropped.
 * @param {BasicRoll} roll  An evaluated roll.
 * @returns {object|null}
 */
export function buildAdvantageInfo(roll) {
  const { D20Roll } = dnd5e.dice;
  if ( !(roll instanceof D20Roll) || !roll._evaluated || !roll.validD20Roll ) return null;

  const die = roll.d20;
  const mode = roll.hasAdvantage ? "advantage" : roll.hasDisadvantage ? "disadvantage" : "normal";
  const results = (die.results ?? []).map(result => ({
    discarded: !result.active,
    rerolled: !!result.rerolled,
    result: result.result
  }));
  const dropped = results.filter(r => r.discarded).map(r => r.result);
  const kept = results.filter(r => !r.discarded).map(r => r.result);

  const notes = [];
  if ( die.options?.elvenAccuracy ) notes.push(loc("BCCC.Advantage.Elven"));
  if ( die.options?.halflingLucky ) notes.push(loc("BCCC.Advantage.Lucky"));
  if ( Number.isFinite(die.options?.minimum) ) notes.push(loc("BCCC.Advantage.Minimum", { value: die.options.minimum }));
  if ( Number.isFinite(die.options?.maximum) ) notes.push(loc("BCCC.Advantage.Maximum", { value: die.options.maximum }));

  const label = loc(`BCCC.Advantage.${mode.capitalize()}`);
  const info = {
    dropped: setting("showDiscarded", true) ? dropped : [],
    icon: mode === "advantage" ? "fa-angles-up" : mode === "disadvantage" ? "fa-angles-down" : "fa-minus",
    kept,
    label,
    mode,
    notes,
    results,
    short: mode === "advantage" ? "+" : mode === "disadvantage" ? "−" : "",
    tooltip: [label, ...notes].filterJoin(" • ")
  };
  info.show = setting("showAdvantageBadge", true) && (mode !== "normal");
  return info;
}

/* -------------------------------------------- */

/**
 * Build the breakdown of a damage chat message, grouped by damage type and then by source.
 * @param {DamageRoll[]} rolls  The message's damage rolls.
 * @returns {object}
 */
export function buildDamageBreakdown(rolls) {
  const groups = [];
  let total = 0;
  let hasSources = false;

  for ( const roll of rolls ) {
    const breakdown = buildRollBreakdown(roll);
    const type = roll.options?.type;
    const config = CONFIG.DND5E.damageTypes?.[type] ?? CONFIG.DND5E.healingTypes?.[type] ?? null;
    hasSources ||= breakdown.hasSources;
    total += Math.max(0, roll.total);
    groups.push({
      approximate: breakdown.approximate,
      critical: roll.options?.isCritical === true,
      entries: breakdown.entries,
      formula: roll.formula,
      icon: config?.icon ?? null,
      label: config?.label ?? config?.labelShort ?? "",
      total: roll.total
    });
  }

  return { groups, hasSources, total };
}
