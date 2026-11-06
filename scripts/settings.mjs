import { MODULE_ID } from "./const.mjs";

/**
 * Register all of this module's settings.
 */
export function registerSettings() {
  const register = (key, data) => game.settings.register(MODULE_ID, key, {
    scope: "client",
    config: true,
    ...data
  });

  register("showBreakdown", {
    name: "BCCC.Settings.ShowBreakdown.Name",
    hint: "BCCC.Settings.ShowBreakdown.Hint",
    type: Boolean,
    default: true
  });

  register("expandBreakdown", {
    name: "BCCC.Settings.ExpandBreakdown.Name",
    hint: "BCCC.Settings.ExpandBreakdown.Hint",
    type: Boolean,
    default: false
  });

  register("showDiscarded", {
    name: "BCCC.Settings.ShowDiscarded.Name",
    hint: "BCCC.Settings.ShowDiscarded.Hint",
    type: Boolean,
    default: true
  });

  register("showAdvantageBadge", {
    name: "BCCC.Settings.ShowAdvantageBadge.Name",
    hint: "BCCC.Settings.ShowAdvantageBadge.Hint",
    type: Boolean,
    default: true
  });

  register("showMargin", {
    name: "BCCC.Settings.ShowMargin.Name",
    hint: "BCCC.Settings.ShowMargin.Hint",
    type: Boolean,
    default: true
  });

  register("effectReminders", {
    name: "BCCC.Settings.EffectReminders.Name",
    hint: "BCCC.Settings.EffectReminders.Hint",
    type: Boolean,
    default: true
  });

  register("effectNames", {
    name: "BCCC.Settings.EffectNames.Name",
    hint: "BCCC.Settings.EffectNames.Hint",
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "damageButton", {
    name: "BCCC.Settings.DamageButton.Name",
    hint: "BCCC.Settings.DamageButton.Hint",
    scope: "client",
    config: true,
    type: String,
    default: "hit",
    choices: {
      hit: "BCCC.Settings.DamageButton.Hit",
      always: "BCCC.Settings.DamageButton.Always",
      off: "BCCC.Settings.DamageButton.Off"
    }
  });

  game.settings.register(MODULE_ID, "targetTools", {
    name: "BCCC.Settings.TargetTools.Name",
    hint: "BCCC.Settings.TargetTools.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "owner",
    choices: {
      off: "BCCC.Settings.TargetTools.Off",
      gm: "BCCC.Settings.TargetTools.Gm",
      owner: "BCCC.Settings.TargetTools.Owner"
    }
  });
}
