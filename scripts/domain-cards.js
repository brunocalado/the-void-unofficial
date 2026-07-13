/*!
 * Daggerheart: Void
 * Copyright (c) 2026 https://github.com/brunocalado
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3.
 */

import { MODULE_ID } from './constants.js';
import { escapeHtml, sendStyledChatMessage } from './helpers.js';

/** @type {string} The consumable granted by the Lifeblood Talisman spell. */
const LIFEBLOOD_TALISMAN_UUID = `Compendium.${MODULE_ID}.domains.Item.16PREU0GlMDSwaby`;

/**
 * Dispatch table: card name -> the effect that card performs.
 * Each entry is fully independent — one may post a chat card, another may roll damage
 * or place a template. Nothing is shared between them beyond this lookup.
 * @type {Record<string, () => Promise<void>>}
 */
const CARD_EFFECTS = {
    'Lifeblood Talisman': _lifebloodTalisman
};

/**
 * Runs the effect registered for a domain card.
 * Exposed as `Void.DomainCards("Lifeblood Talisman")`.
 *
 * @param {string} cardName - The domain card's name, matched case-insensitively.
 * @returns {Promise<void>}
 */
export async function DomainCards(cardName) {
    const wanted = String(cardName ?? '').trim().toLowerCase();
    const effect = Object.entries(CARD_EFFECTS).find(([name]) => name.toLowerCase() === wanted)?.[1];

    if (!effect) {
        ui.notifications.warn(`${MODULE_ID} | No effect is registered for the domain card "${cardName}".`);
        return;
    }

    await effect();
}

/**
 * Lifeblood Talisman: posts a chat card offering the talisman consumable.
 * The item name is rendered as a `@UUID` content link, which core enrichment turns into
 * a draggable anchor, so any player who sees the message can drag the talisman onto their
 * character sheet (the Domains pack grants players OBSERVER, which drag-copy requires).
 *
 * @returns {Promise<void>}
 */
async function _lifebloodTalisman() {
    const item = await foundry.utils.fromUuid(LIFEBLOOD_TALISMAN_UUID);
    if (!item) {
        ui.notifications.error(`${MODULE_ID} | The Lifeblood Talisman item could not be found in the Domains compendium.`);
        return;
    }

    const description = item.system?.description ?? '';

    const body = `
        <div style="display: flex; gap: 12px; align-items: center;">
            <img src="${escapeHtml(item.img)}" alt="${escapeHtml(item.name)}" width="64" height="64"
                 style="flex: 0 0 auto; border: none; border-radius: 6px; object-fit: cover;">
            <div style="flex: 1 1 auto; font-size: 1.15em; font-weight: bold;">
                @UUID[${item.uuid}]{${item.name}}
            </div>
        </div>
        ${description ? `<div style="margin-top: 10px;">${description}</div>` : ''}
        <div style="margin-top: 10px; font-size: 0.85em; font-style: italic; color: #b8b8b8;">
            Drag the item name onto your character sheet to add it.
        </div>`;

    await sendStyledChatMessage(canvas.tokens?.controlled[0]?.actor, {
        title: item.name,
        body
    });
}
