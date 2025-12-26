# Chrome Gemini Sync - Chrome Extension

**The Browser side of the Chrome/Gemini bridge.**

This Chrome extension connects to the local Gemini Extension server to provide page context (DOM, screenshots, console logs) to the Gemini CLI.

## Installation

1.  **Build the extension:**
    ```bash
    npm install
    npm run build
    ```
2.  **Load in Chrome:**
    - Open `chrome://extensions`
    - Enable **Developer Mode**
    - Click **Load Unpacked**
    - Select the `dist` folder (or the root folder if `manifest.json` is in root - *Note: Manifest is in root, but it points to files in dist/*).

## Usage

- Click the extension icon to verify connection status.
- Ensure the Gemini CLI extension is running (it starts automatically when you use it in Gemini).
