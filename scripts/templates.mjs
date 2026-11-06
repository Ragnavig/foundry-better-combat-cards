import { TEMPLATES } from "./const.mjs";

/**
 * Handlebars partials provided by this module.
 * @type {Record<string, string>}
 */
const PARTIALS = {
  "bccc.breakdown": `${TEMPLATES}/parts/breakdown.hbs`,
  "bccc.breakdown-entry": `${TEMPLATES}/parts/breakdown-entry.hbs`,
  "bccc.target-tools": `${TEMPLATES}/parts/target-tools.hbs`
};

/** @type {Promise<Function[]>|null} */
let loading = null;

/**
 * Load and register this module's partials. Safe to call more than once.
 * @returns {Promise<Function[]>}
 */
export function loadModuleTemplates() {
  loading ??= foundry.applications.handlebars.loadTemplates(PARTIALS);
  return loading;
}

/**
 * Resolves once this module's partials are available.
 * @returns {Promise<Function[]>}
 */
export function templatesReady() {
  return loadModuleTemplates();
}
