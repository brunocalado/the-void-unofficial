/*!
 * Daggerheart: Void
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID, ORDER_OF_THE_LYCAN_FLAG } from './constants.js';
import { escapeHtml, sendStyledChatMessage } from './helpers.js';

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
