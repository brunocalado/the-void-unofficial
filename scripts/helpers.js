/**
 * Shared helper functions used across the module's features.
 * Per project convention, all cross-cutting helpers live in this single file.
 */

/**
 * Determines the Void tier for a given character level.
 * Tier bands: level 1 -> tier 1; 2-4 -> tier 2; 5-8 -> tier 3; 9-10 -> tier 4.
 * @param {number} level - The character's current level (system.levelData.level.current).
 * @returns {number} The tier (1-4).
 */
export function getTierFromLevel(level) {
    if (level >= 9) return 4;
    if (level >= 5) return 3;
    if (level >= 2) return 2;
    return 1;
}

/**
 * Computes the Warlock Favor bonus for a given character level.
 * Tier 1 grants +2; each tier beyond that adds +1 (Tier 2 = +3, Tier 3 = +4, Tier 4 = +5).
 * @param {number} level - The character's current level.
 * @returns {number} The flat bonus granted by the current tier.
 */
export function getFavorBonus(level) {
    return getTierFromLevel(level) + 1;
}

/**
 * HTML-escapes a string for safe insertion into chat card markup.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Builds an HTML chat card matching this module's visual style
 * (dark background, gold-accented header — see Combo Strike's chat card).
 * @param {object} options
 * @param {string} options.title - Header text, shown uppercase.
 * @param {string} options.body - HTML body content (already trusted/escaped by the caller).
 * @param {string} [options.borderColor='#C9A060'] - Accent border color.
 * @returns {string} The chat card HTML.
 */
export function buildStyledChatCard({ title, body, borderColor = '#C9A060' }) {
    return `
        <div class="chat-card" style="border: 2px solid ${borderColor}; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid ${borderColor};">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: ${borderColor} !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    ${title}
                </h3>
            </header>
            <div class="card-content" style="background-color: #222; padding: 14px 18px; color: #e0e0e0; font-family: 'Lato', sans-serif; line-height: 1.5;">
                ${body}
            </div>
        </div>`;
}

/**
 * Sends a chat message using the module's styled card, speaking as the given actor.
 * @param {foundry.documents.Actor} actor - The actor to speak as.
 * @param {{title: string, body: string, borderColor?: string}} cardOptions
 * @returns {Promise<ChatMessage>}
 */
export async function sendStyledChatMessage(actor, cardOptions) {
    return ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({ actor }),
        content: buildStyledChatCard(cardOptions),
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
}
