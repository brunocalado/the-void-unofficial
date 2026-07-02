import { MODULE_ID, WARLOCK_FAVOR_FLAG, SPHERE_NAME_FLAG } from './constants.js';
import { getTierFromLevel, getFavorBonus, escapeHtml, sendStyledChatMessage } from './helpers.js';

/** @type {number} Fixed number of Favor Spheres tracked by the item's clickable pips. */
const MAX_SPHERES = 6;

/**
 * Checks whether an item is the Warlock Favor tracker: a "feature" item carrying
 * this module's `Warlock Favor` flag set to true.
 * @param {foundry.documents.Item} item
 * @returns {boolean}
 */
export function isWarlockFavorItem(item) {
    return item?.type === 'feature' && item.getFlag(MODULE_ID, WARLOCK_FAVOR_FLAG) === true;
}

/**
 * Resolves the character actor a macro call should act on: the controlled
 * token's actor, falling back to the user's assigned character.
 * @returns {foundry.documents.Actor|null} A "character" type actor, or null if none found.
 */
function _resolveCharacterActor() {
    const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
    return actor?.type === 'character' ? actor : null;
}

// ── Macro entry point ──────────────────────────────────────────

/**
 * Main entry point for the Warlock Favor macro. Can be called via Void.WarlockFavor()
 * Finds the acting character's Warlock Favor item and recharges its Spheres
 * (equal to Presence). Spending Spheres is done via the clickable pips on the sheet.
 * @returns {Promise<void>}
 */
export async function WarlockFavor() {
    const actor = _resolveCharacterActor();
    if (!actor) {
        ui.notifications.warn('Select a token or assign a character to use Warlock Favor.');
        return;
    }

    const item = actor.items.find(isWarlockFavorItem);
    if (!item) {
        ui.notifications.warn(`${actor.name} has no Warlock Favor feature.`);
        return;
    }

    await _rechargeFavorSpheres(actor, item);
}

/**
 * Recovers Favor Spheres equal to the actor's Presence trait, up to the item's
 * maximum, and posts a chat message reporting how many were recovered.
 * Spending Spheres is handled entirely by the clickable pips on the actor sheet
 * (see _injectFavorPanel), so this macro only performs the recharge action.
 * @param {foundry.documents.Actor} actor
 * @param {foundry.documents.Item} item
 * @returns {Promise<void>}
 */
async function _rechargeFavorSpheres(actor, item) {
    const current = item.system.resource.value ?? 0;
    const max = Number(item.system.resource.max) || MAX_SPHERES;

    if (current >= max) {
        await sendStyledChatMessage(actor, {
            title: 'Warlock Favor — Sphere Recharged',
            body: `<p><strong>${escapeHtml(actor.name)}</strong>'s Favor Spheres are already at maximum (${max}).</p>`
        });
        return;
    }

    const presence = Number(actor.system.traits?.presence?.value) || 0;
    const recovered = Math.max(0, Math.min(presence, max - current));
    const newValue = current + recovered;

    await item.update({ 'system.resource.value': newValue });

    await sendStyledChatMessage(actor, {
        title: 'Warlock Favor — Sphere Recharged',
        body: recovered > 0
            ? `
                <p><strong>${escapeHtml(actor.name)}</strong> communes with their patron and recovers <strong>${recovered}</strong> Favor Sphere${recovered === 1 ? '' : 's'}.</p>
                <p style="opacity: .7;">Current Spheres: ${newValue}/${max}</p>
              `
            : `<p><strong>${escapeHtml(actor.name)}</strong> communes with their patron, but their Presence yields no Favor to recover.</p>`
    });
}

// ── Actor sheet display layer ────────────────────────────────────

/**
 * Called from the renderHandlebarsApplication hook for every ApplicationV2 render.
 * For "character" type actors, finds any Warlock Favor item rows in the rendered
 * sheet, hides their native resource counter, and injects the custom Sphere UI.
 * @param {foundry.applications.api.ApplicationV2} app
 * @param {HTMLElement} element
 * @returns {void}
 */
export function onRenderActorSheet(app, element) {
    const actor = app.document ?? app.actor ?? app.object;
    if (!(actor instanceof Actor) || actor.type !== 'character') return;

    const editable = app.isEditable ?? actor.isOwner;

    element.querySelectorAll('li.inventory-item[data-item-id]').forEach(li => {
        // Remove anything injected on a previous render before deciding whether to rebuild it.
        li.querySelector(':scope > .void-warlock-favor-panel')?.remove();
        li.querySelector('.void-favor-bonus-badge')?.remove();

        const item = actor.items.get(li.dataset.itemId);
        if (!item || !isWarlockFavorItem(item)) return;

        _hideNativeResourceCounter(li);
        _injectFavorBadge(li, actor);
        _injectFavorPanel(li, actor, item, editable);
    });
}

/**
 * Hides the native `.item-resource` counter (the plain numeric input) rendered
 * inside the inventory row header for this item, so it doesn't sit alongside
 * the custom Sphere pips.
 * @param {HTMLElement} li - The `<li class="inventory-item">` row element.
 * @returns {void}
 */
function _hideNativeResourceCounter(li) {
    li.querySelectorAll('.inventory-item-header .item-resource').forEach(el => {
        el.style.setProperty('display', 'none', 'important');
    });
}

/**
 * Injects a "Bonus: +N" badge right after the item name in the row header,
 * so the tier bonus is visible at a glance without expanding the row.
 * @param {HTMLElement} li - The `<li class="inventory-item">` row element.
 * @param {foundry.documents.Actor} actor
 * @returns {void}
 */
function _injectFavorBadge(li, actor) {
    const nameEl = li.querySelector('.inventory-item-header .item-label .item-name');
    if (!nameEl) return;

    const level = actor.system.levelData?.level?.current ?? 1;
    const tier = getTierFromLevel(level);
    const bonus = getFavorBonus(level);

    const badge = document.createElement('span');
    badge.className = 'the-void-unofficial void-favor-bonus-badge';
    badge.dataset.tooltip = `Tier ${tier} Favor Bonus`;
    badge.textContent = `Bonus: +${bonus}`;

    nameEl.insertAdjacentElement('afterend', badge);
}

/**
 * Builds and inserts the custom Warlock Favor panel (Sphere name field and 6
 * clickable Sphere pips, on a single row) right after `.item-main` — above any
 * feature action buttons the system renders below it — so it stays visible
 * without requiring the row to be expanded.
 * @param {HTMLElement} li - The `<li class="inventory-item">` row element.
 * @param {foundry.documents.Actor} actor
 * @param {foundry.documents.Item} item
 * @param {boolean} editable - Whether the sheet is editable by the current user.
 * @returns {void}
 */
function _injectFavorPanel(li, actor, item, editable) {
    const sphereName = item.getFlag(MODULE_ID, SPHERE_NAME_FLAG) ?? '';
    const value = item.system.resource.value ?? 0;

    const spheresHtml = Array.from({ length: MAX_SPHERES }, (_, i) => i + 1)
        .map(n => `
            <span class="void-favor-sphere${value >= n ? ' filled' : ''}" data-value="${n}" data-tooltip="${n}/${MAX_SPHERES}">
                <i class="fa-solid fa-circle"></i>
            </span>
        `).join('');

    const panel = document.createElement('div');
    panel.className = 'the-void-unofficial void-warlock-favor-panel';
    panel.innerHTML = `
        <div class="void-favor-row">
            <input type="text" class="void-favor-sphere-input" value="${escapeHtml(sphereName)}" placeholder="Sphere name…" ${editable ? '' : 'disabled'} />
            <div class="void-favor-spheres">${spheresHtml}</div>
        </div>
    `;

    const itemMain = li.querySelector(':scope > .item-main');
    if (itemMain) itemMain.insertAdjacentElement('afterend', panel);
    else li.appendChild(panel);

    if (!editable) {
        panel.querySelectorAll('.void-favor-sphere').forEach(el => el.classList.add('disabled'));
        return;
    }

    panel.querySelector('.void-favor-sphere-input').addEventListener('change', async event => {
        await item.setFlag(MODULE_ID, SPHERE_NAME_FLAG, event.currentTarget.value.trim());
    });

    panel.querySelectorAll('.void-favor-sphere').forEach(pip => {
        pip.addEventListener('click', async () => {
            const clicked = Number(pip.dataset.value);
            const current = item.system.resource.value ?? 0;
            const newValue = current >= clicked ? clicked - 1 : clicked;
            await item.update({ 'system.resource.value': newValue });
            await _sendSphereClickMessage(actor, item, current, newValue);
        });
    });
}

/**
 * Posts a chat message explaining a Sphere count change made by clicking a pip directly.
 * @param {foundry.documents.Actor} actor
 * @param {foundry.documents.Item} item
 * @param {number} previous - The resource value before the click.
 * @param {number} current - The resource value after the click.
 * @returns {Promise<void>}
 */
async function _sendSphereClickMessage(actor, item, previous, current) {
    const delta = current - previous;
    if (delta === 0) return;

    const gained = delta > 0;
    const sphereName = item.getFlag(MODULE_ID, SPHERE_NAME_FLAG) || item.name;

    await sendStyledChatMessage(actor, {
        title: `Warlock Favor — Sphere ${gained ? 'Gained' : 'Spent'}`,
        body: `
            <p><strong>${escapeHtml(actor.name)}</strong> ${gained ? 'gains' : 'spends'} <strong>${Math.abs(delta)}</strong> Favor Sphere${Math.abs(delta) === 1 ? '' : 's'} (<em>${escapeHtml(sphereName)}</em>).</p>
            <p style="opacity: .7;">Current Spheres: ${current}/${MAX_SPHERES}</p>
        `
    });
}
