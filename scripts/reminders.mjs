import { logError, setting } from "./const.mjs";

/**
 * Reminds the attacker about extra damage they have riding on the creature they just hit.
 *
 * The system models effects such as Hunter's Mark or Hex as an effect that changes nothing about the roll
 * (`changes: []`) plus a separate damage activity on the spell, because a roll's rules can only see the data of the
 * one who rolls, never the target — so no rule can say "only against the creature I marked". Nothing therefore
 * reminds anyone that the extra damage is still waiting to be rolled.
 *
 * This finds those effects by their origin: an effect sitting on a creature that was hit, which came from an item
 * belonging to the attacking actor. That is the attacker's own mark on their own target, so a monster's burning
 * effect on the same creature, or another player's mark, never produces a hint.
 */

/* -------------------------------------------- */

/**
 * Resolve the item an effect originated from.
 * @param {ActiveEffect5e} effect  The effect to trace.
 * @returns {Item5e|null}
 */
function sourceItemFor(effect) {
  const origin = effect?.origin;
  if ( !origin ) return null;

  const resolve = uuid => {
    try {
      return fromUuidSync(uuid, { strict: false });
    } catch(err) {
      return null;
    }
  };

  // The origin is usually the activity that applied the effect; its item is one segment up.
  let document = resolve(origin);
  if ( !document ) {
    const itemUuid = origin.replace(/\.Activity\.[^.]+$/, "");
    if ( itemUuid !== origin ) document = resolve(itemUuid);
  }

  return document?.item ?? document ?? null;
}

/* -------------------------------------------- */

/**
 * The damage activities of an item, if it has any.
 * @param {Item5e} item  Item to inspect.
 * @returns {Activity[]}
 */
function damageActivitiesOf(item) {
  const activities = Array.from(item?.system?.activities ?? []);
  return activities.filter(activity => {
    return (typeof activity.rollDamage === "function") && activity.damage?.parts?.length;
  });
}

/* -------------------------------------------- */

/**
 * Build the reminders for an attack message.
 * @param {ChatMessageDataModel} model  Attack message data model.
 * @returns {object[]|null}
 */
export function buildEffectReminders(model) {
  if ( !setting("effectReminders", true) ) return null;

  const message = model.parent;
  const attacker = message.getAssociatedActor();
  if ( !attacker || !message.isContentVisible ) return null;

  // Only the people who could act on the hint get to see it: its owner and the game master. A player whose character
  // has nothing to do with this attack is not reminded of someone else's mark.
  if ( !game.user.isGM && !attacker.isOwner && !message.isAuthor ) return null;

  const hits = (model.evaluatedTargets ?? []).filter(target => !target.isMiss || (target.ac === null));
  if ( !hits.length ) return null;

  const critical = message.rolls[0]?.isCritical === true;
  const TargetsField = dnd5e.dataModels.chatMessage.fields.TargetsField;
  const reminders = new Map();

  for ( const descriptor of hits ) {
    let targetActor;
    try {
      targetActor = TargetsField.resolve(descriptor).actor;
    } catch(err) {
      continue;
    }
    if ( !targetActor ) continue;

    for ( const effect of targetActor.appliedEffects ?? [] ) {
      const item = sourceItemFor(effect);
      if ( !item || (item.actor !== attacker) ) continue;

      for ( const activity of damageActivitiesOf(item) ) {
        const key = `${item.uuid}|${activity.id}`;
        if ( reminders.has(key) ) continue;
        const formula = activity.labels?.damages?.[0]?.formula ?? activity.damage?.parts?.[0]?.formula ?? "";
        reminders.set(key, {
          activityId: activity.id,
          attackId: message.id,
          critical,
          formula,
          img: effect.img ?? item.img,
          itemUuid: item.uuid,
          name: effect.name ?? item.name,
          label: formula ? `${effect.name ?? item.name} (${formula})` : (effect.name ?? item.name)
        });
      }
    }
  }

  return reminders.size ? Array.from(reminders.values()) : null;
}

/* -------------------------------------------- */

/**
 * Roll the damage of a reminded effect against the targets the attack hit.
 * @param {PointerEvent} event  Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 * @param {Function} targetsFor  Resolves the targets to record on the damage message.
 */
export async function rollReminderDamage(event, target, targetsFor) {
  const attack = game.messages.get(target.dataset.attackId);
  const item = fromUuidSync(target.dataset.itemUuid, { strict: false });
  const activity = item?.system?.activities?.get(target.dataset.activityId);
  if ( typeof activity?.rollDamage !== "function" ) return;

  const isCritical = attack?.rolls?.[0]?.isCritical === true;
  const dialog = isCritical ? { options: { defaultButton: "critical" } } : {};
  const targets = attack ? targetsFor(attack) : null;

  target.disabled = true;
  try {
    await activity.rollDamage(
      { event, isCritical },
      dialog,
      targets ? { data: { system: { targets } } } : {}
    );
  } catch(err) {
    logError("Failed to roll the extra damage of an effect", err);
  } finally {
    target.disabled = false;
  }
}
