/**
 * ChatGPT History Organizer - Content Script
 * Captures the currently open ChatGPT conversation on demand.
 */

import { ChatItem } from '../types';

const CHAT_URL_PATTERNS = [/\/c\/([A-Za-z0-9-]+)/i, /\/chat\/([A-Za-z0-9-]+)/i];

const normalizeText = (value: string) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getChatUrl = (href: string) => {
  try {
    const parsedUrl = new URL(href, window.location.origin);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return href;
  }
};

const extractChatId = (value: string): string | null => {
  for (const pattern of CHAT_URL_PATTERNS) {
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const dedupePrompts = (prompts: string[]) => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  prompts.forEach((prompt) => {
    const normalized = normalizeText(prompt);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push(normalized);
  });

  return deduped;
};

const getPromptNodes = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        '[data-message-author-role="user"]',
        '[data-testid^="conversation-turn-"][data-message-author-role="user"]',
        '[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
        'article[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
        'main article [data-message-author-role="user"]',
      ].join(', '),
    ),
  );

const getPromptText = (node: HTMLElement) => {
  const textCandidates = [
    node.querySelector<HTMLElement>('[class*="whitespace-pre-wrap"]'),
    node.querySelector<HTMLElement>('[class*="markdown"]'),
    node.querySelector<HTMLElement>('[data-testid="user-message"]'),
    node,
  ];

  for (const candidate of textCandidates) {
    const text = normalizeText(candidate?.innerText || candidate?.textContent || '');
    if (text) return text;
  }

  return '';
};

const getCurrentChatTitle = () => {
  const titleFromHeading =
    document.querySelector<HTMLElement>('main h1')?.innerText ||
    document.querySelector<HTMLElement>('header h1')?.innerText ||
    '';

  const titleFromDocument = document.title.replace(/\s*\|\s*ChatGPT\s*$/i, '').trim();

  return normalizeText(titleFromHeading || titleFromDocument || 'Untitled chat');
};

const captureCurrentChat = (): ChatItem | null => {
  const url = getChatUrl(window.location.href);
  const id = extractChatId(url);

  if (!id) return null;

  const prompts = dedupePrompts(
    getPromptNodes()
      .map((node) => getPromptText(node))
      .filter(Boolean),
  );

  return {
    id,
    title: getCurrentChatTitle(),
    url,
    date: new Date().toISOString(),
    prompts,
    capturedAt: new Date().toISOString(),
  };
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'history-organizer:capture-current-chat') {
    const chat = captureCurrentChat();
    sendResponse({ ok: Boolean(chat), chat });
    return true;
  }
});
