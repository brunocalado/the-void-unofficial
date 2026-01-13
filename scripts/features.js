/**
 * Main function to execute the Combo Die mechanic.
 * Can be called via Void.ComboStrikes()
 */
export async function ComboStrikes() {
    // Access DialogV2 from the global foundry API
    const { DialogV2 } = foundry.applications.api;

    // 1. Select Die Type using ApplicationV2 Dialog with Buttons
    // We use .wait() to create a dialog that resolves when a button is clicked
    const dieType = await DialogV2.wait({
        window: { title: "Combo Strike" },
        content: `
            <div style="text-align: center; margin-bottom: 10px;">
                <p style="font-size: 1.1em;">Choose the die for your Combo Strike:</p>
            </div>
        `,
        buttons: [
            {
                action: "d4",
                label: "d4",
                icon: "fa-solid fa-dice-d4",
                callback: (event, button, dialog) => "d4"
            },
            {
                action: "d6",
                label: "d6",
                icon: "fa-solid fa-dice-d6",
                callback: (event, button, dialog) => "d6"
            },
            {
                action: "d8",
                label: "d8",
                icon: "fa-solid fa-dice-d8",
                callback: (event, button, dialog) => "d8"
            },
            {
                action: "d10",
                label: "d10",
                icon: "fa-solid fa-dice-d10",
                callback: (event, button, dialog) => "d10"
            }
        ],
        close: () => null,
        rejectClose: false
    });

    // Exit if cancelled (dieType will be null)
    if (!dieType) return;

    // 2. Initialize variables
    let rolls = [];
    let total = 0;
    let previousRoll = 0;
    let rollCount = 0;
    let continueRolling = true;

    // 3. Start the combo rolling sequence
    while (continueRolling) {
        rollCount++;
        
        // Create and evaluate the roll
        let roll = new Roll(`1${dieType}`);
        await roll.evaluate();
        
        // Show 3D dice if Dice So Nice is available
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }
        
        const currentValue = roll.total;
        rolls.push(currentValue);
        total += currentValue;
        
        // Logic for continuing or stopping
        // Rule: Continue rolling as long as you roll equal to or higher than the previous roll
        if (rollCount === 1) {
            // First roll - always continue to check against next
            previousRoll = currentValue;
        } else {
            // Subsequent rolls
            if (currentValue >= previousRoll) {
                previousRoll = currentValue;
            } else {
                continueRolling = false;
            }
        }
        
        // Safety check to prevent infinite loops (though mathematically unlikely with dice)
        if (rollCount > 20) {
            ui.notifications.warn("Combo Die stopped after 20 rolls to prevent infinite loop.");
            break;
        }
    }

    // 4. Prepare the chat message content
    const rollsText = rolls.map((roll, index) => {
        const rollNum = index + 1;
        if (index === 0) {
            return `Roll ${rollNum}: <strong>${roll}</strong>`;
        } else if (index === rolls.length - 1 && rolls.length > 1) {
            return `Roll ${rollNum}: <strong>${roll}</strong> (stopped)`;
        } else {
            return `Roll ${rollNum}: <strong>${roll}</strong>`;
        }
    }).join('<br>');

    // Create chat message HTML using the requested style
    const chatContent = `
        <div class="chat-card" style="border: 2px solid #C9A060; border-radius: 8px; overflow: hidden;">
            <header class="card-header flexrow" style="background: #191919 !important; padding: 8px; border-bottom: 2px solid #C9A060;">
                <h3 class="noborder" style="margin: 0; font-weight: bold; color: #C9A060 !important; font-family: 'Aleo', serif; text-align: center; text-transform: uppercase; letter-spacing: 1px; width: 100%;">
                    COMBO STRIKE
                </h3>
            </header>
            <div class="card-content" style="background-color: #222; padding: 25px 20px; min-height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; position: relative;">
                <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.75); z-index: 0;"></div>
                <div style="position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; align-items: center;">
                    
                    <div style="color: #ffffff; font-size: 1.4em; font-weight: 800; margin-bottom: 10px; text-transform: uppercase; font-family: 'Aleo', serif; text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">
                        Total Damage
                    </div>

                    <div style="color: #ffffff !important; font-size: 3em; font-weight: bold; text-shadow: 0px 0px 15px #ad0000, 2px 2px 2px #000; font-family: 'Lato', sans-serif;">${total}</div>
                    
                    <div style="color: #ffffff; font-size: 1.1em; margin-top: 5px; font-style: italic;">
                        ${rollsText}
                    </div>

                    <div style="color: #e0e0e0; font-size: 0.9em; margin-top: 8px; font-weight: bold; background: rgba(0,0,0,0.5); padding: 2px 8px; border-radius: 4px;">
                        Die Type: ${dieType.toUpperCase()}
                    </div>
                </div>
            </div>
        </div>`;

    // 5. Send message to chat
    ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker({actor: canvas.tokens.controlled[0]?.actor}),
        content: chatContent,
        style: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    console.log(`Combo Die Results: Rolls = [${rolls.join(', ')}], Total = ${total}`);
}
