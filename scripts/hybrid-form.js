/*!
 * Daggerheart: Void
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import {
    MODULE_ID,
    ORDER_OF_THE_LYCAN_FLAG,
    HYBRID_FORM_APPEARANCE_FLAG,
    HYBRID_FORM_TOKEN_SNAPSHOT_FLAG
} from './constants.js';
import { escapeHtml, sendStyledChatMessage, resolveCharacterActor } from './helpers.js';

/**
 * Names of the Active Effects that represent the Hybrid Form: the base form and the two
 * upgrades that replace it. Used only to recognise the effects — which one wins is decided
 * by {@link _getUnlockedHybridFormEffect}, not by this order.
 * @type {string[]}
 */
const HYBRID_FORM_EFFECT_NAMES = ['Hybrid Form', 'Hybrid Form - Feral', 'Hybrid Form - Apex Hunter'];

/**
 * Rank of each subclass feature tier, matching the `featureState` counter the Daggerheart
 * system keeps on a subclass item (1 = foundation, 2 = +specialization, 3 = +mastery).
 * @type {Record<string, number>}
 */
const FEATURE_TIERS = { foundation: 1, specialization: 2, mastery: 3 };

/** @type {string} Icon shown on the transform button. Font Awesome has no `fa-wolf`; this brand glyph is a wolf head. */
const WOLF_ICON_CLASS = 'fa-brands fa-wolf-pack-battalion';

/**
 * Marker authors write into a Hybrid Form item's description to declare the token
 * image for that tier, e.g. `Set Token Image with {{{modules/the-void-unofficial/tokens/wolf.webp}}}`.
 * Keeping the image out of code lets each tier (base/Feral/Apex Hunter) show a
 * different portrait just by editing the compendium item's description.
 * @type {RegExp}
 */
const TOKEN_IMAGE_MARKER = /Set Token Image with\s*\{\{\{(.+?)\}\}\}/i;

/**
 * Priority given to every `token.*` Active Effect change this module writes.
 * Matches the core default priority of the `override` change type; kept explicit
 * so the change sort in `TokenDocument#applyActiveEffects` is always well-defined.
 * @type {number}
 */
const APPEARANCE_CHANGE_PRIORITY = 50;

/** @type {string} Fixed art scale applied to the token while in Hybrid Form; the grid footprint itself never changes. */
const APPEARANCE_IMAGE_SCALE = 1.5;

/**
 * Icon shown on the Hybrid Form appearance effect itself (Effects tab / status icon) —
 * always this, regardless of the tier's token image. Doubles as the fallback token
 * texture (see {@link _applyHybridFormAppearance}) when a tier's item has no
 * `Set Token Image with {{{path}}}` marker, or the marker's path is invalid: it's a
 * core Foundry icon, so it's guaranteed to exist without the module shipping its own art.
 * @type {string}
 */
const APPEARANCE_EFFECT_ICON = 'icons/creatures/mammals/wolf-shadow-black.webp';

/**
 * Light emitted by the token while in Hybrid Form (a faint bloodred glow).
 * @type {{dim: number, bright: number, color: string, alpha: number, animationType: string, animationSpeed: number, animationIntensity: number}}
 */
const APPEARANCE_LIGHT = {
    dim: 5,
    bright: 0,
    color: '#7a0000',
    alpha: 0.5,
    animationType: 'pulse',
    animationSpeed: 5,
    animationIntensity: 5
};

/**
 * Finds the actor's Order of the Lycan subclass item. Detection is driven by the module
 * flag rather than the item name, so a renamed or translated subclass still resolves.
 * @param {foundry.documents.Actor} actor
 * @returns {foundry.documents.Item|null}
 */
function _getLycanSubclass(actor) {
    return (
        actor.items.find(
            item => item.type === 'subclass' && item.getFlag(MODULE_ID, ORDER_OF_THE_LYCAN_FLAG) === true
        ) ?? null
    );
}

/**
 * Whether the actor has the Order of the Lycan subclass.
 * @param {foundry.documents.Actor} actor
 * @returns {boolean}
 */
export function isOrderOfTheLycan(actor) {
    return _getLycanSubclass(actor) !== null;
}

/**
 * Whether the actor is currently transformed into their Hybrid Form.
 *
 * Derived from the Active Effects themselves rather than tracked in a separate flag:
 * the effects are the state, so there is nothing to fall out of sync with. It also means
 * toggling the effect by hand on the Effects tab drives the button and the Hope/Stress
 * link exactly like the button does.
 *
 * @param {foundry.documents.Actor} actor
 * @returns {boolean}
 */
export function isInHybridForm(actor) {
    return _collectHybridFormEffects(actor).some(effect => !effect.disabled);
}

// ── Active Effect handling ───────────────────────────────────────

/**
 * Collects every Hybrid Form Active Effect present on the actor.
 *
 * The subclass ships these effects on its feature Items. V14 no longer copies transferred
 * effects into `actor.effects` — they stay on their parent Item and are applied from there
 * — so both the actor's own effects and each item's effects have to be searched.
 *
 * @param {foundry.documents.Actor} actor
 * @returns {foundry.documents.ActiveEffect[]}
 */
function _collectHybridFormEffects(actor) {
    const found = [];

    for (const collection of [actor.effects, ...actor.items.map(item => item.effects)]) {
        for (const effect of collection) {
            if (HYBRID_FORM_EFFECT_NAMES.includes(effect.name)) found.push(effect);
        }
    }

    return found;
}

/**
 * Picks the Hybrid Form effect the character has actually unlocked.
 *
 * The Daggerheart system embeds every subclass feature item on the sheet from level 1, so
 * the mere presence of the Apex Hunter item means nothing. What gates a feature is the
 * subclass's `featureState` counter (1 = foundation, 2 = +specialization, 3 = +mastery)
 * versus the tier of the feature granting the effect. The highest unlocked tier wins, so
 * the upgrades supersede the base form as the character levels instead of stacking.
 *
 * @param {foundry.documents.Actor} actor
 * @returns {foundry.documents.ActiveEffect|null} The effect to enable, or null if none qualify.
 */
function _getUnlockedHybridFormEffect(actor) {
    const unlockedTier = _getLycanSubclass(actor)?.system?.featureState ?? 1;

    let best = null;
    let bestTier = 0;

    for (const effect of _collectHybridFormEffects(actor)) {
        // An effect placed directly on the actor has no granting feature; treat it as base.
        const tier = FEATURE_TIERS[effect.parent?.system?.identifier] ?? 1;
        if (tier <= unlockedTier && tier > bestTier) {
            best = effect;
            bestTier = tier;
        }
    }

    return best;
}

/**
 * Enables the single Hybrid Form effect the character has unlocked and disables the others,
 * or disables all of them when reverting to human form.
 *
 * Each effect is embedded in its own feature Item, so the updates are grouped by parent
 * document and issued as one batched `updateDocuments` call per parent.
 *
 * @param {foundry.documents.Actor} actor
 * @param {boolean} active - True when entering Hybrid Form, false when reverting.
 * @returns {Promise<void>}
 */
async function _applyHybridFormEffects(actor, active) {
    const effects = _collectHybridFormEffects(actor);
    if (!effects.length) {
        ui.notifications.warn(`${actor.name} has no Hybrid Form effect to toggle.`);
        return;
    }

    const enabled = active ? _getUnlockedHybridFormEffect(actor) : null;

    // An Item effect with `transfer: false` is never applied to the Actor and never shows up
    // on the sheet, so enabling it would silently do nothing. Surface that as authoring
    // feedback rather than letting the transformation look broken.
    if (enabled && !enabled.transfer && enabled.parent instanceof Item) {
        ui.notifications.warn(
            `"${enabled.name}" has transfer disabled, so it will not apply to ${actor.name}. Enable "Transfer to Actor" on that effect.`
        );
    }

    const byParent = new Map();
    for (const effect of effects) {
        const disabled = effect !== enabled;
        if (effect.disabled === disabled) continue;

        const updates = byParent.get(effect.parent) ?? [];
        updates.push({ _id: effect.id, disabled });
        byParent.set(effect.parent, updates);
    }

    await Promise.all(
        [...byParent].map(([parent, updates]) =>
            ActiveEffect.implementation.updateDocuments(updates, { parent })
        )
    );

    await _applyHybridFormAppearance(actor, enabled);
}

// ── Token appearance (image, scale, light) ───────────────────────

/**
 * Finds this module's own Hybrid Form appearance effect on the actor, if any.
 * Kept separate from the subclass's tiered gameplay effects (see
 * {@link HYBRID_FORM_EFFECT_NAMES}) so replacing or removing it never touches
 * those.
 * @param {foundry.documents.Actor} actor
 * @returns {foundry.documents.ActiveEffect|null}
 */
function _getAppearanceEffect(actor) {
    return actor.effects.find(effect => effect.getFlag(MODULE_ID, HYBRID_FORM_APPEARANCE_FLAG) === true) ?? null;
}

/**
 * Reads the token image path out of a Hybrid Form item's description, looking
 * for the `Set Token Image with {{{path}}}` marker (see {@link TOKEN_IMAGE_MARKER}).
 * @param {string|null|undefined} description - The item's `system.description` HTML.
 * @returns {string|null} The declared path, or null if the marker is missing.
 */
function _extractTokenImagePath(description) {
    return TOKEN_IMAGE_MARKER.exec(description ?? '')?.[1]?.trim() || null;
}

/**
 * Whether `path` would pass the `TokenDocument` schema's own `texture.src` validation
 * (file extension, wildcard support, etc.) — reusing the live field's `validate()`
 * rather than reimplementing Foundry's extension rules.
 *
 * Checked proactively, before ever handing the path to `updateDocuments`: confirmed
 * live (v14.367) that a per-document schema validation failure does not reject the
 * `updateDocuments` promise — Foundry logs the error and notifies the user
 * internally, then silently drops that document from the batch and resolves
 * normally. A try/catch around the update would therefore never run; the only way
 * to catch a bad path (e.g. the shipped item's `{{{path}}}` marker left unedited)
 * is to check it before the call.
 * @param {string} path
 * @returns {boolean}
 */
function _isValidTokenTexturePath(path) {
    return TokenDocument.schema.getField('texture.src').validate(path) === null;
}

/**
 * Builds the Active Effect `changes` that override the token's light.
 *
 * Every key is prefixed `token.` — a native v14 Active Effect feature, independent
 * of the Daggerheart system, where core strips the `token.` prefix and applies the
 * change straight to the placed `TokenDocument` (every scene, for every token of
 * this actor) instead of to the Actor itself. Confirmed against this module's
 * companion `light-sources` module, which drives a token's light the same way.
 * @returns {object[]} The change entries for `ActiveEffect#system#changes`.
 */
function _buildLightChanges() {
    const entry = (key, value) => ({
        key,
        value,
        type: 'override',
        phase: 'initial',
        priority: APPEARANCE_CHANGE_PRIORITY
    });

    return [
        entry('token.light.dim', APPEARANCE_LIGHT.dim),
        entry('token.light.bright', APPEARANCE_LIGHT.bright),
        entry('token.light.color', APPEARANCE_LIGHT.color),
        entry('token.light.alpha', APPEARANCE_LIGHT.alpha),
        entry('token.light.animation.type', APPEARANCE_LIGHT.animationType),
        entry('token.light.animation.speed', APPEARANCE_LIGHT.animationSpeed),
        entry('token.light.animation.intensity', APPEARANCE_LIGHT.animationIntensity)
    ];
}

/**
 * Actor#getDependentTokens can hand back tokens that have already been removed
 * (`_id: null`, `_destroyed: true`) instead of omitting them — a known Foundry
 * quirk the Daggerheart system itself works around the same way (see its
 * `toggleClowncar`). Updating one of those stale entries throws "id does not
 * exist in the EmbeddedCollection collection", so they're filtered out here
 * before any Token update is attempted.
 * @param {foundry.documents.Actor} actor
 * @returns {foundry.documents.TokenDocument[]}
 */
function _getLiveDependentTokens(actor) {
    return actor.getDependentTokens().filter(token => token._id && !token._destroyed);
}

/**
 * Overrides every dependent token's texture (image + 1.5x scale, mirror preserved)
 * with a direct, persisted update, snapshotting each token's own current texture
 * first (once — a snapshot already present is left untouched, so re-entering
 * Hybrid Form at a different tier can't clobber it with an already-transformed
 * texture).
 *
 * Unlike the light, this cannot be done through an Active Effect `token.texture.*`
 * override: the change lands in the token's *derived* data, which the canvas has
 * no reason to redraw from (nothing about a redraw is normally triggered by an
 * Active Effect being created/updated) — the new art was only ever visible
 * transiently, while dragging the token forced a fresh read. A genuine document
 * update fires the normal `_onUpdate` → render-flags → redraw pipeline instead.
 *
 * `rotation` is a separate TokenDocument field this function never touches, so it
 * always survives the transform untouched. Mirroring is different: it's encoded as
 * the *sign* of `texture.scaleX`/`scaleY` rather than a dedicated field, so it has
 * to be read off the token's current texture and carried over explicitly — applying
 * a bare positive {@link APPEARANCE_IMAGE_SCALE} would silently un-mirror every
 * flipped token on every transform.
 *
 * @param {foundry.documents.Actor} actor
 * @param {string} imagePath - Token image path, already validated by the caller
 *   (see {@link _isValidTokenTexturePath} and {@link _applyHybridFormAppearance}).
 * @returns {Promise<void>}
 */
async function _applyTokenTexture(actor, imagePath) {
    const byScene = new Map();

    for (const token of _getLiveDependentTokens(actor)) {
        const updates = byScene.get(token.parent) ?? [];
        updates.push({
            _id: token.id,
            texture: {
                src: imagePath,
                scaleX: Math.sign(token.texture.scaleX || 1) * APPEARANCE_IMAGE_SCALE,
                scaleY: Math.sign(token.texture.scaleY || 1) * APPEARANCE_IMAGE_SCALE
            },
            ...(token.getFlag(MODULE_ID, HYBRID_FORM_TOKEN_SNAPSHOT_FLAG)
                ? {}
                : {
                      [`flags.${MODULE_ID}.${HYBRID_FORM_TOKEN_SNAPSHOT_FLAG}`]: {
                          src: token.texture.src,
                          scaleX: token.texture.scaleX,
                          scaleY: token.texture.scaleY
                      }
                  })
        });
        byScene.set(token.parent, updates);
    }

    await Promise.all(
        [...byScene].map(([scene, updates]) => TokenDocument.implementation.updateDocuments(updates, { parent: scene }))
    );
}

/**
 * Restores every dependent token's texture from its Hybrid Form snapshot (see
 * {@link _applyTokenTexture}) and clears the snapshot flag. Tokens without a
 * snapshot are left alone — they were never transformed to begin with.
 * @param {foundry.documents.Actor} actor
 * @returns {Promise<void>}
 */
async function _revertTokenTexture(actor) {
    const byScene = new Map();

    for (const token of _getLiveDependentTokens(actor)) {
        const snapshot = token.getFlag(MODULE_ID, HYBRID_FORM_TOKEN_SNAPSHOT_FLAG);
        if (!snapshot) continue;

        const updates = byScene.get(token.parent) ?? [];
        updates.push({
            _id: token.id,
            texture: snapshot,
            // The dotted `-=key` deletion syntax is deprecated in v14; a nested
            // ForcedDeletion sentinel is the replacement it now asks for.
            flags: { [MODULE_ID]: { [HYBRID_FORM_TOKEN_SNAPSHOT_FLAG]: new foundry.data.operators.ForcedDeletion() } }
        });
        byScene.set(token.parent, updates);
    }

    await Promise.all(
        [...byScene].map(([scene, updates]) => TokenDocument.implementation.updateDocuments(updates, { parent: scene }))
    );
}

/**
 * Creates, refreshes or removes the actor's Hybrid Form appearance: the token's
 * image/scale (direct token update, see {@link _applyTokenTexture}) and its light
 * (a dedicated Active Effect, see {@link _buildLightChanges}).
 *
 * The light effect uses `type: 'base'`, pinning it to core's own Active Effect
 * data model rather than whatever subtype the system registers, so
 * `system.changes` keeps the shape this code writes regardless of how
 * Daggerheart reshapes its own effects. Deleting it (rather than merely
 * disabling it) is what reverts the light: core restores the token's own stored
 * light once the override is gone, so — unlike the texture — no snapshot is
 * needed for it.
 *
 * The token image itself always falls back to {@link APPEARANCE_EFFECT_ICON} —
 * both when the tier's item has no `Set Token Image with {{{path}}}` marker at
 * all, and when the marker's path is set but rejected by the TokenDocument
 * schema (e.g. the shipped compendium item still has the literal `{{{path}}}`
 * placeholder, never replaced with real art). Either way Hybrid Form still
 * visibly does something instead of throwing or silently no-opping.
 *
 * @param {foundry.documents.Actor} actor
 * @param {foundry.documents.ActiveEffect|null} enabledEffect - The tier-appropriate
 *   Hybrid Form effect just enabled, or null when reverting to human form.
 * @returns {Promise<void>}
 */
async function _applyHybridFormAppearance(actor, enabledEffect) {
    const existingLightEffect = _getAppearanceEffect(actor);

    if (!enabledEffect) {
        if (existingLightEffect) await actor.deleteEmbeddedDocuments('ActiveEffect', [existingLightEffect.id]);
        await _revertTokenTexture(actor);
        return;
    }

    const itemName = enabledEffect.parent?.name ?? enabledEffect.name;
    const requestedImagePath = _extractTokenImagePath(enabledEffect.parent?.system?.description);

    let imagePath = APPEARANCE_EFFECT_ICON;
    if (!requestedImagePath) {
        ui.notifications.info(
            `"${itemName}" has no "Set Token Image with {{{path}}}" marker in its description; using the default wolf art instead.`
        );
    } else if (!_isValidTokenTexturePath(requestedImagePath)) {
        ui.notifications.info(
            `"${itemName}" has an invalid Set Token Image path ("${requestedImagePath}"); using the default wolf art instead.`
        );
    } else {
        imagePath = requestedImagePath;
    }

    await _applyTokenTexture(actor, imagePath);

    const data = {
        name: 'Hybrid Form — Appearance',
        img: APPEARANCE_EFFECT_ICON,
        type: 'base',
        transfer: false,
        system: { changes: _buildLightChanges() },
        flags: { [MODULE_ID]: { [HYBRID_FORM_APPEARANCE_FLAG]: true } }
    };

    if (existingLightEffect) {
        await actor.updateEmbeddedDocuments('ActiveEffect', [{ _id: existingLightEffect.id, ...data }]);
    } else {
        await actor.createEmbeddedDocuments('ActiveEffect', [data]);
    }
}

/**
 * Toggles the actor in or out of Hybrid Form by flipping the matching Active Effects.
 * The effects are the single source of truth for the form, so nothing else needs writing:
 * the button and the Hope/Stress link both read back from them.
 * @param {foundry.documents.Actor} actor
 * @returns {Promise<void>}
 */
export async function toggleHybridForm(actor) {
    await _applyHybridFormEffects(actor, !isInHybridForm(actor));
}

// ── Macro entry point ──────────────────────────────────────────

/**
 * Main entry point for the Hybrid Form macro. Can be called via Void.HybridForm()
 * Does exactly what the actor sheet's wolf button does: toggles the acting
 * character in or out of Hybrid Form.
 * @returns {Promise<void>}
 */
export async function HybridForm() {
    const actor = resolveCharacterActor();
    if (!actor) {
        ui.notifications.warn('Select a token or assign a character to use Hybrid Form.');
        return;
    }

    if (!isOrderOfTheLycan(actor)) {
        ui.notifications.warn(`${actor.name} is not an Order of the Lycan.`);
        return;
    }

    await toggleHybridForm(actor);
}

// ── The Beast Within: Hope gains cost Stress ─────────────────────

/**
 * Called from the `preUpdateActor` hook. While the character is in Hybrid Form, any
 * update that raises Hope also marks the same amount of Stress ("The Beast Within").
 *
 * The Stress mark is folded into the incoming `changed` object rather than issued as a
 * follow-up update: that keeps Hope and Stress in a single atomic write and avoids
 * re-entering this hook. `preUpdate*` hooks run only on the client that initiated the
 * update, so the chat message is posted exactly once.
 *
 * @param {foundry.documents.Actor} actor - The actor, still holding its pre-update values.
 * @param {object} changed - The differential update data, mutated in place.
 * @returns {void}
 */
export function onPreUpdateActor(actor, changed) {
    if (actor.type !== 'character' || !isInHybridForm(actor)) return;

    const newHope = foundry.utils.getProperty(changed, 'system.resources.hope.value');
    if (typeof newHope !== 'number') return;

    const gained = newHope - (actor.system.resources.hope.value ?? 0);
    if (gained <= 0) return;

    // Honour a Stress change already present in the same update (an action spending
    // Stress to gain Hope, for instance) instead of overwriting it.
    const currentStress =
        foundry.utils.getProperty(changed, 'system.resources.stress.value') ??
        actor.system.resources.stress.value ??
        0;

    const maxStress = actor.system.resources.stress.max;
    const room = Number.isFinite(maxStress) ? Math.max(0, maxStress - currentStress) : gained;
    const marked = Math.min(gained, room);
    if (marked <= 0) return;

    foundry.utils.setProperty(changed, 'system.resources.stress.value', currentStress + marked);
    _sendBeastWithinMessage(actor, gained, marked);
}

/**
 * Posts the chat card explaining why Stress was marked alongside the Hope gain.
 * @param {foundry.documents.Actor} actor
 * @param {number} gained - Hope gained by the triggering update.
 * @param {number} marked - Stress marked as a result.
 * @returns {Promise<void>}
 */
async function _sendBeastWithinMessage(actor, gained, marked) {
    await sendStyledChatMessage(actor, {
        title: 'The Beast Within',
        body: `
            <p><em>When you gain a Hope while in Hybrid Form, you also mark a Stress.</em></p>
            <p><strong>${escapeHtml(actor.name)}</strong> gains <strong>${gained}</strong> Hope and marks <strong>${marked}</strong> Stress.</p>
        `
    });
}

// ── Actor sheet display layer ────────────────────────────────────

/**
 * Called from the `renderHandlebarsApplication` hook for every ApplicationV2 render.
 * On an Order of the Lycan character sheet, inserts the wolf transform button into the
 * header row, in the gap between the Hope track and the domain icons.
 * @param {foundry.applications.api.ApplicationV2} app
 * @param {HTMLElement} element
 * @returns {void}
 */
export function onRenderActorSheet(app, element) {
    const actor = app.document ?? app.actor ?? app.object;
    if (!(actor instanceof Actor) || actor.type !== 'character') return;

    // Remove anything injected on a previous render before deciding whether to rebuild it.
    element.querySelector('.void-hybrid-form-toggle')?.remove();

    const resourceSection = element.querySelector('.character-row .resource-section');
    if (!resourceSection || !isOrderOfTheLycan(actor)) return;

    // Sits as a sibling of the resource and domain sections rather than inside the Hope
    // track, so it reads as its own control instead of a seventh Hope pip.
    resourceSection.insertAdjacentElement('afterend', _buildTransformButton(actor, app.isEditable ?? actor.isOwner));
}

/**
 * Builds the wolf transform button reflecting the actor's current form.
 * Called from `_onRender` via {@link onRenderActorSheet}.
 * @param {foundry.documents.Actor} actor
 * @param {boolean} editable - Whether the sheet is editable by the current user.
 * @returns {HTMLButtonElement}
 */
function _buildTransformButton(actor, editable) {
    const active = isInHybridForm(actor);

    const button = document.createElement('button');
    // No `data-action`: the sheet's ApplicationV2 dispatcher would look for a handler it
    // does not own. The listener below is bound directly instead.
    button.type = 'button';
    button.className = `the-void-unofficial void-hybrid-form-toggle${active ? ' active' : ''}`;
    button.ariaPressed = String(active);
    button.dataset.tooltip = active ? 'Hybrid Form — revert to human form' : 'Hybrid Form — transform';
    button.innerHTML = `<i class="${WOLF_ICON_CLASS}" inert></i>`;

    if (editable) {
        button.addEventListener('click', () =>
            toggleHybridForm(actor).catch(err => {
                ui.notifications.error(`${MODULE_ID} | Failed to toggle Hybrid Form. See the console.`);
                console.error(`${MODULE_ID} | Failed to toggle Hybrid Form for ${actor.name}:`, err);
            })
        );
    } else {
        button.disabled = true;
    }

    return button;
}
