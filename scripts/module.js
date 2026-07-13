import * as VoidFeatures from './features.js';
import { MODULE_ID } from './constants.js';
import { onRenderActorSheet as onRenderWarlockFavor } from './warlock-favor.js';
import { onRenderActorSheet as onRenderHybridForm, onPreUpdateActor } from './hybrid-form.js';

console.log(`${MODULE_ID} | Module JS Loaded`);

Hooks.once('init', () => {
    console.log(`${MODULE_ID} | Initializing The Void (Unofficial)`);

    window.Void = window.Void || {};
    Object.assign(window.Void, VoidFeatures);

    console.log(`${MODULE_ID} | Void features registered:`, Object.keys(VoidFeatures));
});

Hooks.on('renderHandlebarsApplication', (app, element) => {
    onRenderWarlockFavor(app, element);
    onRenderHybridForm(app, element);
});

Hooks.on('preUpdateActor', (actor, changed) => {
    onPreUpdateActor(actor, changed);
});

Hooks.on('ready', async () => {
    if (game.system.id !== 'daggerheart') return;
    await registerVoidDomains();
});

/**
 * Registers Blood and Dread as homebrew domains in the Daggerheart system settings.
 * Skips any domain that is already present to avoid duplicates.
 *
 * The Daggerheart 'Homebrew' setting is a DhHomebrew DataModel instance.
 * We must call .toObject() before spreading to obtain a plain JSON-serializable
 * representation — spreading the DataModel instance directly omits nested fields
 * (restMoves, adversaryTypes, resources, etc.) that are not enumerable own properties,
 * which would silently wipe the system's default downtime actions on save.
 *
 * @returns {Promise<void>}
 */
async function registerVoidDomains() {
    let homebrewSettings;
    try {
        homebrewSettings = game.settings.get('daggerheart', 'Homebrew');
    } catch (e) {
        console.warn(`${MODULE_ID} | Could not read Daggerheart 'Homebrew' setting.`, e);
        return;
    }

    if (!homebrewSettings) return;

    const domainData = {
        blood: { id: 'blood', label: 'Blood', src: 'icons/svg/blood.svg', description: 'The Blood domain.' },
        dread: { id: 'dread', label: 'Dread', src: 'icons/svg/terror.svg', description: 'The Dread domain.' }
    };

    // Convert the DataModel instance to a plain object so all nested fields are preserved.
    const plain = homebrewSettings.toObject();
    const currentDomains = { ...(plain.domains || {}) };

    let hasUpdates = false;
    for (const [key, data] of Object.entries(domainData)) {
        if (!currentDomains[key]) {
            console.log(`${MODULE_ID} | Registering missing domain: ${data.label}`);
            currentDomains[key] = data;
            hasUpdates = true;
        }
    }

    if (!hasUpdates) return;

    try {
        await game.settings.set('daggerheart', 'Homebrew', { ...plain, domains: currentDomains });
        ui.notifications.info(`${MODULE_ID} | Registered Blood and Dread domains in Homebrew Settings.`);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to update Homebrew settings:`, err);
    }
}
