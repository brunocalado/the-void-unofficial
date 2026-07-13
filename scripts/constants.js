/** @type {string} The module's unique identifier, mirrored from module.json. */
export const MODULE_ID = 'the-void-unofficial';

/**
 * Flag key (under this module's scope) used to mark a "feature" item as the
 * Warlock Favor tracker. Written manually on the relevant compendium item —
 * this module only reads it to identify the item.
 * @type {string}
 */
export const WARLOCK_FAVOR_FLAG = 'Warlock Favor';

/**
 * Flag key (under this module's scope) used to store the player-chosen name
 * of the Sphere invoked through the Warlock Favor item.
 * @type {string}
 */
export const SPHERE_NAME_FLAG = 'sphereName';

/**
 * Flag key (under this module's scope) marking a "subclass" item as Order of the
 * Lycan. Written manually on the relevant compendium item — this module only
 * reads it to identify the subclass, so renaming the item cannot break detection.
 * @type {string}
 */
export const ORDER_OF_THE_LYCAN_FLAG = 'orderOfTheLycan';
