import { MODULE_ID, logError } from "./const.mjs";
import { patchChatCards } from "./cards.mjs";
import { loadModuleTemplates } from "./templates.mjs";
import { patchRollClasses } from "./sources.mjs";
import { registerSettings } from "./settings.mjs";

/**
 * Better Combat Chat Cards for the D&D 5e system.
 */

Hooks.once("init", () => {
  if ( game.system.id !== "dnd5e" ) {
    console.warn(`${MODULE_ID} | This module requires the D&D 5e system and will stay inactive.`);
    return;
  }

  registerSettings();
  loadModuleTemplates();

  try {
    patchRollClasses();
  } catch(err) {
    logError("Failed to patch the system's roll classes", err);
  }

  try {
    patchChatCards();
  } catch(err) {
    logError("Failed to patch the system's chat cards", err);
  }

  console.log(`${MODULE_ID} | Ready.`);
});

Hooks.once("ready", () => {
  if ( game.system.id !== "dnd5e" ) return;
  // Re-apply in case another module replaced a data model's metadata during setup.
  try {
    patchChatCards();
  } catch(err) {
    logError("Failed to re-apply the chat card patches", err);
  }
});
