# ChatGPT History Organizer - Chrome Extension

This extension enhances the ChatGPT web interface by organizing your chat history, allowing you to search, filter, and export your conversations.

## Features
- **Automatic Sync**: Scrapes your ChatGPT sidebar and current chat messages.
- **Organization**: Groups chats by date (Today, Yesterday, Last 7 Days, Month).
- **Search & Filter**: Find specific conversations by keywords in titles or prompts.
- **Detailed View**: See all user prompts from a specific chat without leaving the popup.
- **Export**: Download your history as JSON or CSV.
- **Dark Mode**: Supports both light and dark themes.

## Setup Instructions

### 1. Build the Extension
Run the following command in your terminal:
```bash
npm run build
```
This will create a `dist` folder containing all the necessary files.

### 2. Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right corner).
3. Click **Load unpacked**.
4. Select the `dist` folder from this project.

### 3. Usage
1. Go to [chatgpt.com](https://chatgpt.com).
2. The extension will automatically start syncing your sidebar chats.
3. Click on a chat in the sidebar to sync its messages/prompts.
4. Click the extension icon in your browser toolbar to open the organizer.

## Technical Details
- **Manifest V3**: Uses the latest Chrome extension standards.
- **Content Scripts**: Safely scrapes the ChatGPT DOM using `MutationObserver`.
- **Chrome Storage**: Caches your history locally for fast access.
- **React & Tailwind**: Built with a modern, responsive UI.

## Note on Icons
The extension expects icons (`icon16.png`, `icon48.png`, `icon128.png`) in the `public` folder. You can add your own icons or convert the provided SVG to PNGs.
