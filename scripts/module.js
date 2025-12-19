const MODULE_ID = 'the-void-unofficial';

Hooks.once('init', () => {
    console.log(`${MODULE_ID} | Initializing The Void (Unofficial)`);
});

Hooks.on('ready', async () => {
    // Only run if the system is Daggerheart
    if (game.system.id !== 'daggerheart') return;

    // Register Blood and Dread domains in system settings
    await registerVoidDomains();
});

async function registerVoidDomains() {
    // Access Daggerheart Homebrew Settings
    // The system stores homebrew config in a setting named 'Homebrew' (case sensitive check needed)
    // Based on homebrewSettings.mjs:
    // game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew)
    // where CONFIG.DH.id is 'daggerheart' and CONFIG.DH.SETTINGS.gameSettings.Homebrew is likely 'Homebrew' or 'homebrew'.
    // Let's safe check both or retrieve via CONFIG if possible, but we don't have CONFIG in this script context easily checked without running it.
    // However, usually it's 'homebrew'.

    // Check if the setting exists
    let homebrewSettings;
    try {
        homebrewSettings = game.settings.get('daggerheart', 'Homebrew');
    } catch (e) {
        try {
            homebrewSettings = game.settings.get('daggerheart', 'homebrew');
        } catch (e2) {
            console.warn(`${MODULE_ID} | Could not find Daggerheart 'Homebrew' or 'homebrew' setting.`);
            return;
        }
    }

    if (!homebrewSettings) return;

    const domainData = {
        'blood': {
            id: 'blood',
            label: 'Blood',
            src: `modules/${MODULE_ID}/images/domains-icons/blood.webp`,
            description: 'The Blood domain.'
        },
        'dread': {
            id: 'dread',
            label: 'Dread',
            src: `modules/${MODULE_ID}/images/dread.webp`,
            description: 'The Dread domain.'
        }
    };

    let updates = false;
    // user domains are in homebrewSettings.domains
    const currentDomains = { ...(homebrewSettings.domains || {}) };

    for (const [key, data] of Object.entries(domainData)) {
        if (!currentDomains[key]) {
            console.log(`${MODULE_ID} | Registering missing domain: ${data.label}`);
            currentDomains[key] = data;
            updates = true;
        }
    }

    if (updates) {
        // Update the setting
        // We know we got homebrewSettings, we just update it.
        try {
            // We need to keep the structure of homebrewSettings intact (it has 'domains', 'adversaryTypes', etc.)
            const newSettings = {
                ...homebrewSettings,
                domains: currentDomains
            };

            // We need to know the Key used to set it.
            // If get('daggerheart', 'Homebrew') worked, key is 'Homebrew'.
            // Simplest way is iterate keys? No.
            // Let's assume 'Homebrew' based on common Foundry patterns if capital H was used in class name, 
            // but 'homebrewSettings' variable is the object.

            // Ideally we'd use the same key we succeeded with.
            // I'll assume 'Homebrew' is the primary guess as per my check order, 
            // but actually strict safely requires trying the same key.

            // Re-fetch logic or just use a helper variable for the key.
            let key = 'Homebrew';
            if (game.settings.settings.has('daggerheart.homebrew')) key = 'homebrew';

            await game.settings.set('daggerheart', key, newSettings);

            ui.notifications.info(`${MODULE_ID} | Registered missing domains (Blood/Dread) in Homebrew Settings.`);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to update settings:`, err);
        }
    }
}
