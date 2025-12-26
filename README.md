# Chrome Gemini Sync - Chrome Extension

**The Browser side of the Chrome/Gemini bridge.**

This Chrome extension connects to the local Gemini Extension server to provide page context (DOM, screenshots, console logs) to the Gemini CLI.

> **Note:** This project is currently tested and supported only on **macOS (Apple Silicon)**.

## Prerequisites

- **Node.js** (v20 or higher)
- **Google Chrome** browser
- **Gemini CLI** installed and configured

## Setup Instructions

### 1. Install the Gemini Extension (Server Side)

Before setting up the browser extension, ensure the Gemini CLI side is ready. This handles the server that the browser extension connects to.

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/yourusername/ChromeGeminiSync-GeminiExtension.git

# Link it to Gemini
gemini extensions link ./ChromeGeminiSync-GeminiExtension
```

### 2. Build the Chrome Extension

Since this extension is not yet in the Chrome Web Store, you need to build it locally.

```bash
# Navigate to the extension folder
cd ChromeGeminiSync-ChromeExtension

# Install dependencies
npm install

# Build the project
npm run build
```

*This will create a `dist/` folder containing the compiled extension.*

### 3. Load into Chrome

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** (toggle in the top right corner).
3.  Click **Load unpacked**.
4.  Select the **`ChromeGeminiSync-ChromeExtension`** folder (the root folder of this repo).

### 4. Verify Connection

1.  Click the extension icon in your Chrome toolbar.
2.  Open the side panel if prompted.
3.  You should see a connection status indicator.
    - If it says **Connected**, you are ready to go!
    - If it says **Disconnected**, simply run any browser-related command in Gemini (e.g., "Take a screenshot"), and the server will start automatically.

## Usage

Once connected, you can ask Gemini to:

- "Look at this page and summarize it"
- "Take a screenshot of the current tab"
- "What text do I have selected?"
- "Check the console logs for errors"

## Troubleshooting

- **Extension won't load:** Ensure you ran `npm run build` and that the `dist/` folder exists.
- **Connection failed:** Try running a command in Gemini first to wake up the server.
- **"Manifest not found":** Make sure you selected the root folder `ChromeGeminiSync-ChromeExtension` when loading unpacked, not the `src` folder.