import { TEMPLATES, loc, logError, setting } from "./const.mjs";
import { buildAdvantageInfo, buildDamageBreakdown, buildRollBreakdown } from "./breakdown.mjs";
import { buildTargetTools, changeTargets, damageTargetsFor, removeTarget } from "./targets.mjs";
import { templatesReady } from "./templates.mjs";

/**
 * Replaces the attack and damage chat cards of the D&D 5e system with cards that are built on top of the system's own
 * data models and partials, so everything the stock cards can do keeps working.
 */

/* -------------------------------------------- */

/**
 * Patch the system's roll rendering and chat message data models.
 */
export function patchChatCards() {
  patchRollRendering();

  const { AttackMessageData, DamageMessageData, RollMessageData } = dnd5e.dataModels.chatMessage;

  // Every roll message (attack, check, save, …) renders its rolls through this template.
  RollMessageData.ROLL_TEMPLATE = `${TEMPLATES}/parts/roll-compact.hbs`;

  patchModel(AttackMessageData, `${TEMPLATES}/attack-card.hbs`, prepareAttackContext);
  patchModel(DamageMessageData, `${TEMPLATES}/damage-card.hbs`, prepareDamageContext);

  // The damage button on an attack card carries the id of the activation's usage message, so the damage roll is
  // recorded against the same origin as the system's own button. That also routes the click to the usage message's
  // data model, which therefore needs to know the action as well.
  addActions(dnd5e.dataModels.chatMessage.UsageMessageData);
}

/* -------------------------------------------- */

/**
 * Actions this module adds to a chat message data model.
 * @returns {Record<string, Function>}
 */
function moduleActions() {
  return {
    bcccRemoveTarget: onRemoveTarget,
    bcccRollDamage: onRollDamage,
    bcccSetTargets: onSetTargets
  };
}

/* -------------------------------------------- */

/**
 * Add this module's actions to a data model without touching anything else about it.
 * @param {typeof ChatMessageDataModel} cls  Data model to extend.
 */
function addActions(cls) {
  if ( !cls ) return;
  cls.metadata = Object.freeze(foundry.utils.mergeObject(cls.metadata, {
    actions: moduleActions()
  }, { inplace: false }));
}

/* -------------------------------------------- */

/**
 * Add this module's breakdown to the context of every rendered roll.
 */
function patchRollRendering() {
  const cls = dnd5e.dice.BasicRoll;
  if ( cls.prototype._prepareChatRenderContext?.bcccPatched ) return;
  const original = cls.prototype._prepareChatRenderContext;
  const patched = async function(options = {}) {
    const context = await original.call(this, options);
    try {
      await templatesReady();
      const isPrivate = options.isPrivate === true;
      const advantage = isPrivate ? null : buildAdvantageInfo(this);
      const breakdown = isPrivate ? null : buildRollBreakdown(this);

      // Name the advantage mode on the row that shows the d20 results.
      if ( breakdown && advantage ) {
        const entry = breakdown.entries.find(e => e.kind === "d20");
        if ( entry ) entry.note = [advantage.label, ...advantage.notes].filterJoin(" • ");
      }

      context.bccc = {
        advantage,
        breakdown,
        inline: setting("expandBreakdown", false),
        showBreakdown: setting("showBreakdown", true) && !isPrivate
      };
    } catch(err) {
      logError("Failed to build the roll breakdown", err);
      context.bccc = null;
    }
    return context;
  };
  patched.bcccPatched = true;
  cls.prototype._prepareChatRenderContext = patched;
}

/* -------------------------------------------- */

/**
 * Point a chat message data model at one of this module's templates, add this module's actions, and extend its render
 * context.
 * @param {typeof ChatMessageDataModel} cls   Data model to patch.
 * @param {string} template                   Template to render instead of the system's.
 * @param {Function} prepare                  Callback that extends the render context.
 */
function patchModel(cls, template, prepare) {
  if ( !cls ) return;

  cls.metadata = Object.freeze(foundry.utils.mergeObject(cls.metadata, {
    template,
    actions: moduleActions()
  }, { inplace: false }));

  if ( cls.prototype._prepareContext?.bcccPatched ) return;
  const original = cls.prototype._prepareContext;
  const patched = async function(options = {}) {
    const context = await original.call(this, options);
    try {
      await templatesReady();
      await prepare(this, context, options);
    } catch(err) {
      logError("Failed to prepare the chat card context", err);
      context.bccc ??= null;
    }
    return context;
  };
  patched.bcccPatched = true;
  cls.prototype._prepareContext = patched;
}

/* -------------------------------------------- */
/*  Context Preparation                         */
/* -------------------------------------------- */

/**
 * Extend the render context of an attack card.
 * @param {ChatMessageDataModel} model  Message data model.
 * @param {object} context              Render context being prepared.
 */
async function prepareAttackContext(model, context) {
  const message = model.parent;
  context.bccc = {
    showMargin: setting("showMargin", true),
    targetTools: buildTargetTools(message)
  };

  const roll = message.rolls.find(r => r instanceof dnd5e.dice.D20Roll);
  if ( !roll?._evaluated || !message.isContentVisible ) return;

  context.bccc.damageButton = buildDamageButton(model, roll);

  for ( const target of context.targets ?? [] ) {
    if ( !target.showAC || (target.ac === null) ) continue;
    const difference = roll.total - target.ac;
    target.bcccMargin = difference >= 0
      ? loc("BCCC.Targets.MarginOver", { value: difference })
      : loc("BCCC.Targets.MarginUnder", { value: Math.abs(difference) });
    target.bcccMarginClass = target.isMiss ? "miss" : "hit";
  }
}

/* -------------------------------------------- */

/**
 * Extend the render context of a damage card.
 * @param {ChatMessageDataModel} model  Message data model.
 * @param {object} context              Render context being prepared.
 */
async function prepareDamageContext(model, context) {
  const message = model.parent;
  const isPrivate = !message.isContentVisible;
  context.bccc = {
    breakdown: isPrivate ? null : buildDamageBreakdown(message.rolls),
    inline: setting("expandBreakdown", false),
    showBreakdown: setting("showBreakdown", true) && !isPrivate,
    targetTools: buildTargetTools(message)
  };
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/**
 * Handle one of the target tool buttons.
 * @this {ChatMessageDataModel}
 * @param {PointerEvent} event  Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
async function onSetTargets(event, target) {
  event.stopPropagation();
  const { source, mode } = target.dataset;
  target.disabled = true;
  try {
    await changeTargets(this.parent, { source, mode });
  } finally {
    target.disabled = false;
  }
}

/* -------------------------------------------- */

/**
 * Handle removing a single target.
 * @this {ChatMessageDataModel}
 * @param {PointerEvent} event  Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
async function onRemoveTarget(event, target) {
  event.stopPropagation();
  await removeTarget(this.parent, target.dataset.token);
}

/* -------------------------------------------- */

/**
 * Decide whether an attack card should offer to roll damage, and with which label.
 * @param {ChatMessageDataModel} model  Attack message data model.
 * @param {D20Roll} roll                The attack roll.
 * @returns {object|null}
 */
function buildDamageButton(model, roll) {
  const mode = setting("damageButton", "hit");
  if ( mode === "off" ) return null;

  const message = model.parent;
  const activity = message.getAssociatedActivity();
  const hasDamage = activity?.damage?.parts?.length || activity?.item?.system?.properties?.has("amm");
  if ( !hasDamage || (typeof activity.rollDamage !== "function") ) return null;

  // Same audience as the system's own usage buttons.
  const isCreator = game.user.isGM || message.getAssociatedActor()?.isOwner || message.isAuthor;
  if ( !isCreator ) return null;

  // A target whose AC is unknown counts as a miss for the system, but the attack may well have hit it, so it keeps
  // the button available.
  const evaluated = model.evaluatedTargets ?? [];
  const hit = evaluated.filter(target => !target.isMiss || (target.ac === null));
  if ( (mode !== "always") && evaluated.length && !hit.length ) return null;

  const critical = roll.isCritical === true;
  const origin = message.system.origin;
  return {
    attackId: message.id,
    critical,
    label: critical ? "BCCC.Damage.RollCritical" : "BCCC.Damage.Roll",
    originId: (origin?.type === "usage") ? origin.id : null,
    targets: hit.length
  };
}

/* -------------------------------------------- */

/**
 * Roll the damage of the activity an attack card belongs to, recording the targets the attack hit so the damage can
 * be applied to them straight from the damage card's tray.
 * @this {ChatMessageDataModel}
 * @param {PointerEvent} event  Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
async function onRollDamage(event, target) {
  event.stopPropagation();
  const attack = game.messages.get(target.dataset.attackId);
  const base = attack?.getAssociatedActivity();
  if ( typeof base?.rollDamage !== "function" ) return;

  // Mirror what the system does for its own damage button: roll from an item clone carrying the activation's scaling
  // and consumed resources, so an upcast spell or a consumption-scaled attack deals the right damage.
  let activity = base;
  try {
    const usage = attack.getOriginatingMessage();
    if ( usage && (usage !== attack) ) {
      const consumed = base.createConsumedFlag?.(usage.getAssociatedActor(), usage.system.deltas);
      const scaling = usage.system.scaling ?? 0;
      if ( consumed || scaling ) {
        const item = base.item.clone({ "flags.dnd5e": { consumed, scaling } }, { keepId: true });
        activity = item.system.activities.get(base.id) ?? base;
      }
    }
  } catch(err) {
    logError("Failed to rebuild the activation state for a damage roll", err);
  }

  const { ability, ammunitionItem: ammunition, mode: attackMode } = attack.system;
  const isCritical = attack.rolls[0]?.isCritical === true;
  const dialog = isCritical ? { options: { defaultButton: "critical" } } : {};
  const targets = damageTargetsFor(attack);

  target.disabled = true;
  try {
    await activity.rollDamage(
      { ability, ammunition, attackMode, event, isCritical },
      dialog,
      targets ? { data: { system: { targets } } } : {}
    );
  } catch(err) {
    logError("Failed to roll damage from an attack card", err);
  } finally {
    target.disabled = false;
  }
}
