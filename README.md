# Conversation Library

A Chrome extension for saving open ChatGPT conversations into a local library. It captures the current conversation on demand, stores your prompts locally, lets you add notes and bookmarks, and exports either a single conversation or the full library as JSON or PDF.

## What It Does

- Save the currently open ChatGPT conversation
- Keep a local searchable library of saved conversations
- Add notes to each saved conversation
- Bookmark important items for quick filtering
- Export the selected conversation or the full library as JSON or PDF
- Works entirely with local browser storage

## How It Works

This extension does not try to mirror all of ChatGPT history in real time. Instead, it focuses on a reliable manual workflow:

1. Open a conversation on `chatgpt.com`
2. Click `Save Current Chat` in the extension popup
3. Browse, search, annotate, bookmark, and export saved conversations

## Development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Type-check the project:

```bash
npm run lint
```

## Load In Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the local `dist` folder

## Project Structure

- `src/popup/App.tsx`: popup UI
- `src/content/index.ts`: content script for capturing the current conversation
- `public/manifest.json`: Chrome extension manifest

## License

MIT
