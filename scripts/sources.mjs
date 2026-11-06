import { ROLL_OPTION, TERM_OPTION, loc, logError, setting } from "./const.mjs";

/**
 * Records, for every roll the D&D 5e system builds, which part of the formula came from which source, and tags the
 * resulting roll terms so that the chat card can show the origin of every single number.
 *
 * The system assembles its rolls from an array of formula parts such as `["@mod", "@prof", "@ruleBonus"]`, with the
 * values stored in the roll data. Foundry replaces those references with plain numbers while parsing, which is why the
 * stock cards can only ever show `8 + 2 + 2`. Here the parts are inspected *before* the formula is parsed, split into
 * individual summands, labelled, and then matched back onto the parsed terms. The labels live in `Roll#options`, the
 * mapping lives in each term's own options, so both survive being stored on the chat message.
 */

/* -------------------------------------------- */
/*  Patching                                    */
/* -------------------------------------------- */

/**
 * Patch the system's roll classes so every roll records its sources.
 */
export function patchRollClasses() {
  const { BasicRoll, D20Roll, DamageRoll } = dnd5e.dice;

  for ( const cls of [BasicRoll, D20Roll, DamageRoll] ) patchFromConfig(cls);

  // A damage roll rewrites its own terms in the constructor to apply critical scaling, so the terms have to be tagged
  // before that happens. `preprocessFormula` is the last point at which the freshly parsed terms are still untouched,
  // and the copies critical scaling makes carry the tag along with the rest of the term's options.
  if ( !DamageRoll.prototype.preprocessFormula?.bcccPatched ) {
    const original = DamageRoll.prototype.preprocessFormula;
    const patched = function(...args) {
      const result = original.apply(this, args);
      try {
        tagRollTerms(this);
      } catch(err) {
        logError("Failed to record damage roll sources", err);
      }
      return result;
    };
    patched.bcccPatched = true;
    DamageRoll.prototype.preprocessFormula = patched;
  }
}

/* -------------------------------------------- */

/**
 * Wrap a roll class's `fromConfig` so the roll configuration's parts are recorded on the created roll.
 * @param {typeof BasicRoll} cls  Roll class to patch.
 */
function patchFromConfig(cls) {
  if ( cls.fromConfig?.bcccPatched ) return;
  const original = cls.fromConfig;
  const patched = function(config, process) {
    try {
      config.options ??= {};
      config.options[ROLL_OPTION] = buildSegments(this, config, process);
    } catch(err) {
      logError("Failed to describe roll sources", err);
    }
    const roll = original.call(this, config, process);
    try {
      // Damage rolls tag themselves from `preprocessFormula`, before critical scaling rewrites their terms.
      if ( roll && !(roll instanceof dnd5e.dice.DamageRoll) ) tagRollTerms(roll);
    } catch(err) {
      logError("Failed to record roll sources", err);
    }
    return roll;
  };
  patched.bcccPatched = true;
  cls.fromConfig = patched;
}

/* -------------------------------------------- */
/*  Describing the formula                      */
/* -------------------------------------------- */

/**
 * Split a formula into its top-level summands, ignoring anything inside brackets.
 * @param {string} formula  Formula to split.
 * @returns {string[]}      The individual summands, in order, without their joining operators.
 */
export function splitTopLevel(formula) {
  const segments = [];
  let depth = 0;
  let buffer = "";
  let previous = "";
  const push = () => {
    const trimmed = buffer.trim();
    if ( trimmed ) segments.push(trimmed);
    buffer = "";
  };

  for ( const char of String(formula) ) {
    if ( "([{".includes(char) ) depth++;
    else if ( ")]}".includes(char) ) depth--;
    const splits = (depth === 0) && ((char === "+") || (char === "-"))
      && !!buffer.trim() && !"+-*/%^".includes(previous);
    if ( splits ) {
      push();
      previous = char;
      continue;
    }
    buffer += char;
    if ( char.trim() ) previous = char;
  }
  push();

  return segments;
}

/* -------------------------------------------- */

/**
 * Describe every summand of a roll configuration in the order in which it will appear in the parsed formula.
 * @param {typeof BasicRoll} cls                   Roll class being constructed.
 * @param {BasicRollConfiguration} config          Configuration of this individual roll.
 * @param {BasicRollProcessConfiguration} process  Configuration of the whole rolling process.
 * @returns {{ segments: object[], rollType: string }}
 */
function buildSegments(cls, config, process) {
  const { D20Roll, DamageRoll } = dnd5e.dice;
  const isD20 = (cls === D20Roll) || (cls.prototype instanceof D20Roll);
  const isDamage = (cls === DamageRoll) || (cls.prototype instanceof DamageRoll);
  const rollType = isDamage ? "damage" : "d20";
  const segments = [];

  if ( isD20 ) segments.push({
    formula: new CONFIG.Dice.D20Die().formula,
    key: "d20",
    kind: "d20",
    label: loc("BCCC.Source.D20")
  });

  const context = {
    config,
    data: config.data ?? {},
    item: process?.subject?.item ?? null,
    actor: process?.subject?.actor ?? (process?.subject instanceof Actor ? process.subject : null),
    rollType
  };

  for ( const [partIndex, part] of (config.parts ?? []).entries() ) {
    for ( const { formula, key } of expandPart(String(part ?? ""), context) ) {
      segments.push(describeSegment(formula, key, { ...context, partIndex }));
    }
  }

  return { segments, rollType };
}

/* -------------------------------------------- */

/**
 * Split a part into the summands it will contribute to the parsed formula. A part that is nothing but a reference to a
 * bonus the system assembled itself (such as `@ruleBonus`, built by joining the values of every applicable rule) is
 * replaced by those values, so each of them can be named separately.
 * @param {string} part     The part as the system supplied it.
 * @param {object} context  Describing context.
 * @returns {{ formula: string, key?: string }[]}
 */
function expandPart(part, context) {
  const segments = splitTopLevel(part);
  if ( segments.length !== 1 ) return segments.map(formula => ({ formula }));

  const match = segments[0].match(/^@([\w.]+)$/);
  if ( !match ) return [{ formula: segments[0] }];

  const value = foundry.utils.getProperty(context.data, match[1]);
  if ( (typeof value !== "string") || !value.trim() ) return [{ formula: segments[0] }];

  const expanded = splitTopLevel(value);
  if ( !expanded.length ) return [{ formula: segments[0] }];
  return expanded.map(formula => ({ formula, key: match[1] }));
}

/* -------------------------------------------- */

/**
 * Roll part keys whose value the system assembles from the rules applied to the actor and item, and which can
 * therefore be traced back to the effect that granted them.
 * @type {Set<string>}
 */
const RULE_KEYS = new Set(["ruleBonus", "deathBonus", "extraBonus"]);

/* -------------------------------------------- */

/**
 * Keys the system uses for its roll parts, mapped to a localisation key.
 * @type {Record<string, string>}
 */
const KEY_LABELS = {
  activityBonus: "BCCC.Source.ActivityBonus",
  alert: "BCCC.Source.Alert",
  ammoMagic: "BCCC.Source.AmmoMagic",
  bonus: "BCCC.Source.ActivityBonus",
  concentrationBonus: "BCCC.Source.ExtraBonus",
  cover: "BCCC.Source.Cover",
  deathBonus: "BCCC.Source.DeathBonus",
  extraBonus: "BCCC.Source.ExtraBonus",
  prof: "BCCC.Source.Proficiency",
  ruleBonus: "BCCC.Source.Effects",
  situational: "BCCC.Source.Situational",
  toHit: "BCCC.Source.FlatAttack",
  weaponMagic: "BCCC.Source.WeaponMagic"
};

/* -------------------------------------------- */

/**
 * Determine a label for a single summand of a formula.
 * @param {string} formula         The summand.
 * @param {string|null} sourceKey  Key of the roll part this summand was taken from, if it was a reference.
 * @param {object} context         Describing context.
 * @returns {object}               Segment descriptor.
 */
function describeSegment(formula, sourceKey, context) {
  const keys = Array.from(formula.matchAll(/@([\w.]+)/g), m => m[1]);
  const key = keys[0] ?? sourceKey ?? null;
  const descriptor = { formula, key, kind: "bonus", label: null };

  if ( key === "mod" ) descriptor.label = abilityLabel(context);
  else if ( key?.startsWith("reductions.") ) descriptor.label = conditionLabel(key.split(".")[1]);
  else if ( key?.startsWith("scaling") ) descriptor.label = loc("BCCC.Source.Scaling");
  else if ( key && (key in KEY_LABELS) ) descriptor.label = loc(KEY_LABELS[key]);
  else if ( key ) descriptor.label = loc("BCCC.Source.Unknown", { key: key.split(".").pop() });

  // A part without any reference is a literal formula: the first one of a damage roll is the base damage, anything
  // after that is a flat bonus coming from the item or the activity.
  if ( !descriptor.label ) {
    const hasDice = /\dd\d/i.test(formula) || /d\d/i.test(formula);
    if ( (context.rollType === "damage") && (context.partIndex === 0) ) {
      descriptor.label = loc("BCCC.Source.BaseDamage");
      descriptor.kind = "base";
    }
    else if ( context.rollType === "damage" ) descriptor.label = loc("BCCC.Source.DamageBonus");
    else descriptor.label = loc(hasDice ? "BCCC.Source.Dice" : "BCCC.Source.Flat");
  }

  // Bonuses that came from a rule can often be traced back to the effect or feature that granted them. Only the
  // assembled rule bonuses are looked up, so a literal item bonus is never mistaken for an identically valued effect.
  if ( RULE_KEYS.has(key) ) {
    const named = resolveEffectName(formula, context);
    if ( named ) descriptor.label = loc("BCCC.Source.EffectsNamed", { name: named });
  }

  return descriptor;
}

/* -------------------------------------------- */

/**
 * Label for the ability modifier used by a roll.
 * @param {object} context  Describing context.
 * @returns {string}
 */
function abilityLabel(context) {
  const ability = context.data?.roll?.ability ?? context.config?.data?.roll?.ability;
  const label = CONFIG.DND5E.abilities?.[ability]?.label;
  return label ? loc("BCCC.Source.AbilityMod", { ability: label }) : loc("BCCC.Source.AbilityModGeneric");
}

/* -------------------------------------------- */

/**
 * Label for a condition that reduces a roll.
 * @param {string} status  Status identifier.
 * @returns {string}
 */
function conditionLabel(status) {
  const name = CONFIG.DND5E.conditionTypes?.[status]?.label
    ?? CONFIG.statusEffects?.find(e => e.id === status)?.name
    ?? status;
  return loc("BCCC.Source.Condition", { name: game.i18n.localize(name) });
}

/* -------------------------------------------- */

/**
 * Try to find the name of the active effect that contributed a bonus, by matching the bonus formula against the rules
 * currently applied to the rolling actor and item.
 * @param {string} formula  The summand.
 * @param {object} context  Describing context.
 * @returns {string|null}
 */
function resolveEffectName(formula, context) {
  if ( !setting("effectNames", true) ) return null;
  const { actor, item } = context;
  if ( !actor && !item ) return null;

  const wanted = formula.trim();
  if ( !wanted || wanted.startsWith("@") ) return null;

  const names = new Set();
  for ( const document of [actor, item] ) {
    for ( const byType of document?.appliedRules?.values() ?? [] ) {
      for ( const [type, changes] of byType ) {
        if ( type !== "bonus" ) continue;
        for ( const change of changes ) {
          if ( String(change.value ?? "").trim() !== wanted ) continue;
          const name = change.effect?.name ?? change.effect?.parent?.name;
          if ( name ) names.add(name);
        }
      }
    }
  }

  return names.size === 1 ? Array.from(names)[0] : null;
}

/* -------------------------------------------- */
/*  Tagging                                     */
/* -------------------------------------------- */

/**
 * Tag each of a roll's terms with the index of the summand it belongs to.
 * @param {BasicRoll} roll  Roll whose terms should be tagged.
 */
export function tagRollTerms(roll) {
  const meta = roll.options?.[ROLL_OPTION];
  const segments = meta?.segments;
  if ( !segments?.length || meta.tagged || meta.mismatch ) return;

  // Count the terms each summand contributes. The summand is parsed in the same position it occupies in the joined
  // formula — behind an addition — so that a leading sign is parsed exactly as it was in the real formula.
  let counts;
  try {
    counts = segments.map(segment => roll.constructor.parse(`0 + ${segment.formula}`, roll.data).length - 2);
  } catch(err) {
    meta.mismatch = true;
    return;
  }
  const expected = counts.reduce((total, count) => total + count, 0) + (segments.length - 1);

  // If the summands do not add up to the parsed formula something unexpected happened (a module changed the formula,
  // an unusual operator, …). Rather than mislabel numbers, give up and let the card fall back to the plain breakdown.
  if ( counts.some(count => count < 1) || (expected !== roll.terms.length) ) {
    meta.mismatch = true;
    return;
  }

  let index = 0;
  for ( const [position, count] of counts.entries() ) {
    for ( let offset = 0; offset < count; offset++ ) {
      const term = roll.terms[index + offset];
      if ( term ) term.options[TERM_OPTION] = position;
    }
    index += count + 1;
  }
  meta.tagged = true;
}
