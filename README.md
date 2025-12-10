# JKLM WordWizard Bot

This bot joins a JKLM room, listens to chat, and provides words containing specific syllables.

## Setup

1.  Ensure you have Node.js installed.
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running the Bot

Run the bot with:
```bash
node bot.js
```

The bot will:
1.  Launch a browser window.
2.  Navigate to `https://jklm.fun/AHNM`.
3.  Enter the nickname "WordWizard".
4.  Listen for commands in the chat.

## Commands

-   `!help`: Shows available commands.
-   `!find <syllable>` or `!word <syllable>`: Finds a word containing the syllable.
-   "word with <syllable>": Natural language request (e.g., "word with ITJ").
-   Greetings: Responds to "hello bot", "hi bot".

## Configuration

-   **Wordlist**: The bot uses `jklm-wordlist.json` in the same directory.
-   **Room URL**: You can change the URL in `bot.js` (line 29).
