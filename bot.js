const puppeteer = require('puppeteer');
const fs = require('fs');

// Load wordlist
let wordlist = [];
try {
    console.log("Loading wordlist...");
    wordlist = JSON.parse(fs.readFileSync('jklm-wordlist.json', 'utf8'));
    console.log(`Loaded ${wordlist.length} words.`);
} catch (e) {
    console.error("Failed to load wordlist:", e);
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Shared state
    let botName = null;
    const probeId = "init-" + Math.floor(Math.random() * 100000);
    let probeSent = false;

    // Message Queue System
    const messageQueue = [];
    let isProcessingQueue = false;
    let isRateLimited = false;

    // Process the queue
    const processQueue = async () => {
        if (isProcessingQueue || isRateLimited || messageQueue.length === 0) return;

        isProcessingQueue = true;
        const message = messageQueue.shift();

        try {
            await sendChatToPage(page, message);
            // Standard delay between messages to avoid hitting rate limits too fast
            await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
            console.error("Error sending message from queue:", e);
        }

        isProcessingQueue = false;
        processQueue(); // Process next
    };

    const queueMessage = (msg) => {
        messageQueue.push(msg);
        processQueue();
    };

    // Expose function to receive messages from the browser
    await page.exposeFunction('onNewMessage', (author, text) => {
        // Check for system messages indicating rate limit
        if (!author && (text.includes("chatting too fast") || text.includes("slow down"))) {
            console.log("Rate limit detected! Pausing queue for 5 seconds...");
            isRateLimited = true;
            setTimeout(() => {
                console.log("Resuming queue...");
                isRateLimited = false;
                processQueue();
            }, 5000);
            return;
        }

        // 1. Identity Discovery Phase
        if (!botName) {
            if (text === probeId) {
                botName = author;
                console.log(`Identity confirmed: I am '${botName}'`);
                queueMessage(`Hello! I am ${botName}. Type !help for commands!`);
            }
            return;
        }

        // 2. Normal Operation Phase
        handleMessage(page, author, text, botName, queueMessage);
    });

    console.log("Navigating to JKLM...");
    await page.goto('https://jklm.fun/AHNM');

    // Wait for body to load
    await page.waitForSelector('body');

    // Generate random name preference (in case we need to join)
    const adjectives = ['Super', 'Mega', 'Hyper', 'Ultra', 'Epic', 'Mighty', 'Swift', 'Smart'];
    const nouns = ['Bot', 'Brain', 'Mind', 'Wizard', 'Guru', 'Helper', 'Solver', 'Genius'];
    const preferredName = adjectives[Math.floor(Math.random() * adjectives.length)] + nouns[Math.floor(Math.random() * nouns.length)] + Math.floor(Math.random() * 100);

    // Handle Nickname (if not joined)
    try {
        const nicknameSelector = "input[placeholder='Nickname']";
        // Short timeout - if we are already joined, this will fail quickly
        await page.waitForSelector(nicknameSelector, { timeout: 3000 });
        console.log(`Nickname input found. Entering name: ${preferredName}`);

        await page.evaluate((selector, name) => {
            const input = document.querySelector(selector);
            input.value = name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }, nicknameSelector, preferredName);

        await page.keyboard.press('Enter');
    } catch (e) {
        console.log("Nickname input not found. Assuming already joined.");
    }

    // Wait for Chat Input
    const chatInputSelector = "textarea[placeholder='Type here to chat']";
    try {
        await page.waitForSelector(chatInputSelector, { timeout: 15000 });
        console.log("Chat input found. Bot is active!");

        // Send Probe Message to determine our name
        const sendProbe = async () => {
            if (!probeSent) {
                console.log(`Sending probe message: ${probeId}`);
                // Bypass queue for probe to ensure it goes out immediately/first
                // Also add a small delay before sending the first probe
                await new Promise(r => setTimeout(r, 1000));
                await sendChatToPage(page, probeId);
                probeSent = true;
            }
        };

        // Initial probe
        await sendProbe();

        // Retry probe if identity not found in 5 seconds
        setTimeout(async () => {
            if (!botName) {
                console.log("Identity not confirmed yet. Resending probe...");
                probeSent = false;
                await sendProbe();
            }
        }, 5000);

    } catch (e) {
        console.error("Could not find chat input. Bot might not have joined correctly.");
        return;
    }

    // Inject MutationObserver
    await page.evaluate(() => {
        const chatInput = document.querySelector("textarea[placeholder='Type here to chat']");
        if (!chatInput) return;

        // Find chat container
        let parent = chatInput.parentElement;
        let chatContainer = null;
        while (parent) {
            const messages = parent.querySelector('.messages');
            if (messages) {
                chatContainer = messages;
                break;
            }
            parent = parent.parentElement;
            if (parent.tagName === 'BODY') break;
        }

        if (!chatContainer) {
            chatContainer = document.querySelector('.log.darkScrollbar') || document.querySelector('.messages');
        }

        if (!chatContainer) {
            console.error("Could not locate chat message container.");
            return;
        }

        console.log("Chat container found:", chatContainer.className);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // Element
                        // Prevent duplicate processing
                        if (node.getAttribute('data-processed')) return;

                        // Check if this looks like a complete message line
                        const authorElem = node.querySelector('.author');
                        const textElem = node.querySelector('.text');

                        let author = "";
                        let text = "";

                        if (authorElem) {
                            author = authorElem.innerText;
                        }

                        if (textElem) {
                            text = textElem.innerText.trim();
                        } else {
                            // Fallback extraction
                            const clone = node.cloneNode(true);
                            if (clone.querySelector('.author')) clone.querySelector('.author').remove();
                            if (clone.querySelector('.time')) clone.querySelector('.time').remove();
                            text = clone.innerText.trim();
                        }

                        // Clean up
                        text = text.replace(/^\[?\d{1,2}:\d{2}\]?\s*:?\s*/, '');

                        // Filter out empty updates or updates that are just structure without content
                        if (!text && !author) return;

                        const isSystemRateLimit = text.includes("chatting too fast") || text.includes("slow down");

                        if (!author && !isSystemRateLimit) {
                            return;
                        }

                        // Mark as processed only if we are actually handling it
                        node.setAttribute('data-processed', 'true');
                        window.onNewMessage(author, text);
                    }
                });
            });
        });

        observer.observe(chatContainer, { childList: true, subtree: true });
    });

})();

async function handleMessage(page, author, text, botName, queueMessage) {
    console.log(`Received: [${author}] ${text}`);

    // STRICT Ignore Logic
    if (author === botName) return; // Ignore self (confirmed name)
    if (text.startsWith("Here is a word with")) return; // Ignore bot responses (extra safety)
    if (text.startsWith("I couldn't find any words")) return;

    const lowerText = text.toLowerCase();

    // 1. Greetings
    if (lowerText.includes('hello bot') || lowerText.includes('hi bot')) {
        queueMessage(`Hello! I'm ready to help.`);
        return;
    }

    // 2. ! commands
    if (text.includes('!')) {
        const bangIndex = text.indexOf('!');
        const commandPart = text.substring(bangIndex);
        const parts = commandPart.split(' ');
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);

        if (command === '!help') {
            queueMessage("Commands: !find <syl>, !check <word>, !random, !count, !coin");
        }
        else if (command === '!find' || command === '!word') {
            const syllable = args[0];
            if (syllable) {
                respondWithWord(syllable, queueMessage);
            }
        }
        else if (command === '!check') {
            const word = args[0];
            if (word) {
                const exists = wordlist.includes(word.toLowerCase());
                queueMessage(exists ? `'${word}' is in the wordlist!` : `'${word}' is NOT in the wordlist.`);
            }
        }
        else if (command === '!random') {
            const randomWord = wordlist[Math.floor(Math.random() * wordlist.length)];
            queueMessage(`Random word: ${randomWord.toUpperCase()}`);
        }
        else if (command === '!count') {
            queueMessage(`I have ${wordlist.length} words in my dictionary.`);
        }
        else if (command === '!coin') {
            const result = Math.random() < 0.5 ? "Heads" : "Tails";
            queueMessage(`Coin flip: ${result}!`);
        }
    }

    // 3. Natural language requests
    const sylMatch = lowerText.match(/(?:^|\s)word (?:with|containing|that has) ([a-z']{2,})/);
    if (sylMatch) {
        const syllable = sylMatch[1];
        respondWithWord(syllable, queueMessage);
    }
}

function respondWithWord(syllable, queueMessage) {
    const cleanSyl = syllable.toLowerCase().replace(/[^a-z']/g, '');
    if (!cleanSyl) return;

    const matches = wordlist.filter(w => w.includes(cleanSyl));
    if (matches.length > 0) {
        const match = matches[Math.floor(Math.random() * matches.length)];
        queueMessage(`Here is a word with '${cleanSyl.toUpperCase()}': ${match.toUpperCase()}`);
    } else {
        queueMessage(`I couldn't find any words with '${cleanSyl.toUpperCase()}'.`);
    }
}

// Renamed to sendChatToPage to distinguish from the queue wrapper
async function sendChatToPage(page, message) {
    try {
        const chatInputSelector = "textarea[placeholder='Type here to chat']";
        await page.evaluate((selector, msg) => {
            const input = document.querySelector(selector);
            if (input) {
                console.log("Setting input value to:", msg);
                input.value = msg;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                console.error("Input not found in evaluate!");
            }
        }, chatInputSelector, message);

        await new Promise(r => setTimeout(r, 100)); // Small delay
        await page.keyboard.press('Enter');
    } catch (e) {
        console.error("Failed to send chat:", e);
    }
}
