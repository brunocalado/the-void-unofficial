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

/**
 * Flag key (under this module's scope) marking the Active Effect this module
 * creates on the actor to drive the Hybrid Form token light. Lets the module
 * find and replace/remove its own effect without touching the subclass's own
 * tiered Hybrid Form gameplay effects.
 * @type {string}
 */
export const HYBRID_FORM_APPEARANCE_FLAG = 'hybridFormAppearance';

/**
 * Flag key (under this module's scope), written on a Token itself, storing its
 * texture as it was before Hybrid Form overrode it. Active Effect changes cannot
 * reliably force the canvas to reload a token's sprite texture, so the image swap
 * is done with a direct, persisted Token update instead — which means (unlike the
 * light) the original value has to be snapshotted here to be restored on revert.
 * @type {string}
 */
export const HYBRID_FORM_TOKEN_SNAPSHOT_FLAG = 'hybridFormTextureSnapshot';
