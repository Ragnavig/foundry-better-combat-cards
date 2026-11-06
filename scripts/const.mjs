/**
 * Shared constants for Better Combat Chat Cards.
 */

/** @type {string} */
export const MODULE_ID = "better-combat-chat-card";

/** Key under which this module stores its metadata inside `Roll#options`. */
export const ROLL_OPTION = "bccc";

/** Key under which this module tags an individual `RollTerm` with the index of its source segment. */
export const TERM_OPTION = "bcccSrc";

/** Path prefix for this module's templates. */
export const TEMPLATES = `modules/${MODULE_ID}/templates`;

/**
 * Shorthand for localisation.
 * @param {string} key              Localisation key.
 * @param {object} [data]           Data used for string formatting.
 * @returns {string}
 */
export function loc(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Read one of this module's settings, falling back gracefully if it has not been registered yet.
 * @param {string} key          Setting key.
 * @param {any} [fallback]      Value to use if the setting cannot be read.
 * @returns {any}
 */
export function setting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch(err) {
    return fallback;
  }
}

/**
 * Log an error without breaking the surrounding render or roll.
 * @param {string} message   Context for the error.
 * @param {Error} err        The error that was caught.
 */
export function logError(message, err) {
  console.error(`${MODULE_ID} | ${message}`, err);
}
