import { loc, logError, setting } from "./const.mjs";

/**
 * Lets the recorded targets of an attack or damage card be changed after the fact. The targets live in the message's
 * own system data, so updating them makes the system re-evaluate hits and misses and re-build the damage tray.
 */

/* -------------------------------------------- */

/**
 * The targets field of the D&D 5e system.
 * @returns {typeof TargetsField}
 */
function targetsField() {
  return dnd5e.dataModels.chatMessage.fields.TargetsField;
}

/* -------------------------------------------- */

/**
 * May the current user change the recorded targets of this message?
 * @param {ChatMessage5e} message  Message to check.
 * @returns {boolean}
 */
export function canUseTargetTools(message) {
  if ( !message?.isOwner ) return false;
  switch ( setting("targetTools", "owner") ) {
    case "gm": return game.user.isGM;
    case "owner": return game.user.isGM || (message.author === game.user);
    default: return false;
  }
}

/* -------------------------------------------- */

/**
 * Find the attack roll message belonging to this message's activation, if there is one.
 * @param {ChatMessage5e} message  Damage or attack message.
 * @returns {ChatMessage5e|null}
 */
export function findAttackMessage(message) {
  if ( message.type === "attack" ) return message;
  const origin = message.getOriginatingMessage?.();
  if ( !origin ) return null;
  const attacks = origin.getAssociatedRolls?.("attack") ?? [];
  return attacks.at(-1) ?? null;
}

/* -------------------------------------------- */

/**
 * Collect target descriptors for one of the available sources.
 * @param {ChatMessage5e} message  Message being updated.
 * @param {string} source          One of `targeted`, `selected`, `attackHits`, `attackAll` or `clear`.
 * @returns {object[]|null}        Descriptors, or `null` if the source could not be resolved.
 */
function descriptorsFor(message, source) {
  const Targets = targetsField();
  switch ( source ) {
    case "clear":
      return [];
    case "targeted":
      return Targets.getDescriptors(game.user.targets);
    case "selected":
      return Targets.getDescriptors(canvas.tokens?.controlled ?? []);
    case "attackAll":
    case "attackHits": {
      const attack = findAttackMessage(message);
      if ( !attack ) {
        ui.notifications.warn(loc("BCCC.Targets.NoAttack"));
        return null;
      }
      const targets = (source === "attackHits")
        ? (attack.system.evaluatedTargets ?? []).filter(target => !target.isMiss)
        : (attack.system.targets ?? []);
      return targets.map(({ ac, actor, img, name, token }) => ({ ac, actor, img, name, token }));
    }
    default:
      return null;
  }
}

/* -------------------------------------------- */

/**
 * Change the recorded targets of a message.
 * @param {ChatMessage5e} message          Message to update.
 * @param {object} options
 * @param {string} options.source          Where the new targets come from.
 * @param {"set"|"add"} [options.mode]     Replace the existing targets or add to them.
 * @returns {Promise<ChatMessage5e|void>}
 */
export async function changeTargets(message, { source, mode = "set" } = {}) {
  if ( !canUseTargetTools(message) ) return;

  const incoming = descriptorsFor(message, source);
  if ( incoming === null ) return;

  if ( !incoming.length && (source === "targeted") ) {
    ui.notifications.warn(loc("BCCC.Targets.NoneSelected"));
    return;
  }
  if ( !incoming.length && (source === "selected") ) {
    ui.notifications.warn(loc("BCCC.Targets.NoneSelected"));
    return;
  }

  let targets = incoming;
  if ( mode === "add" ) {
    const existing = (message.system.targets ?? []).map(({ ac, actor, img, name, token }) => {
      return { ac, actor, img, name, token };
    });
    const byToken = new Map(existing.map(target => [target.token, target]));
    for ( const target of incoming ) byToken.set(target.token, target);
    targets = Array.from(byToken.values());
  }

  try {
    return await message.update({ "system.targets": targets });
  } catch(err) {
    logError("Failed to update the targets of a chat message", err);
  }
}

/* -------------------------------------------- */

/**
 * Remove a single target from a message.
 * @param {ChatMessage5e} message  Message to update.
 * @param {string} token           UUID of the token to remove.
 * @returns {Promise<ChatMessage5e|void>}
 */
export async function removeTarget(message, token) {
  if ( !canUseTargetTools(message) || !token ) return;
  const targets = (message.system.targets ?? [])
    .filter(target => target.token !== token)
    .map(({ ac, actor, img, name, token: uuid }) => ({ ac, actor, img, name, token: uuid }));
  try {
    return await message.update({ "system.targets": targets });
  } catch(err) {
    logError("Failed to remove a target from a chat message", err);
  }
}

/* -------------------------------------------- */

/**
 * Build the context used to render the target tool buttons.
 * @param {ChatMessage5e} message  Message the tools belong to.
 * @returns {object|null}
 */
export function buildTargetTools(message) {
  if ( !canUseTargetTools(message) ) return null;
  const tools = [
    { action: "bcccSetTargets", icon: "fa-solid fa-bullseye", label: "BCCC.Targets.FromTargeted", source: "targeted", mode: "set" },
    { action: "bcccSetTargets", icon: "fa-solid fa-bullseye-pointer", label: "BCCC.Targets.AddTargeted", source: "targeted", mode: "add" },
    { action: "bcccSetTargets", icon: "fa-solid fa-expand", label: "BCCC.Targets.FromSelected", source: "selected", mode: "set" },
    { action: "bcccSetTargets", icon: "fa-solid fa-trash-can", label: "BCCC.Targets.Clear", source: "clear", mode: "set" }
  ];
  if ( message.type === "damage" ) tools.splice(3, 0,
    { action: "bcccSetTargets", icon: "fa-solid fa-crosshairs", label: "BCCC.Targets.FromAttackHits", source: "attackHits", mode: "set" },
    { action: "bcccSetTargets", icon: "fa-solid fa-users-viewfinder", label: "BCCC.Targets.FromAttackAll", source: "attackAll", mode: "set" }
  );
  return tools;
}

/* -------------------------------------------- */

/**
 * The targets a damage roll started from an attack card should be recorded against: the ones the attack hit, or the
 * ones whose AC could not be determined. Falls back to every target of the attack, and to `null` when the attack
 * recorded no targets at all — in that case the system's own default (the user's current targets) is kept.
 * @param {ChatMessage5e} attack  The attack message.
 * @returns {object[]|null}
 */
export function damageTargetsFor(attack) {
  const evaluated = attack?.system?.evaluatedTargets ?? [];
  if ( !evaluated.length ) return null;
  const hit = evaluated.filter(target => !target.isMiss || (target.ac === null));
  const chosen = hit.length ? hit : evaluated;
  return chosen.map(({ ac, actor, img, name, token }) => ({ ac, actor, img, name, token }));
}
