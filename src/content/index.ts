/**
 * ChatGPT History Organizer - Content Script
 * Scrapes the ChatGPT sidebar and chat history.
 */

import { ChatItem, ChromeStorage } from '../types';

const extractChatId = (url: string): string | null => {
  const match = url.match(/\/c\/([A-Za-z0-9-]+)/);
  return match ? match[1] : null;
};

const getChatUrl = (href: string) => {
  try {
    const parsedUrl = new URL(href, window.location.origin);
    return `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    return href;
  }
};

const normalizeTitle = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const isSidebarSectionLabel = (value: string) => {
  const normalized = normalizeTitle(value).toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'today' ||
    normalized === 'yesterday' ||
    normalized === 'previous 7 days' ||
    normalized === 'last 7 days' ||
    normalized === 'previous 30 days' ||
    normalized === 'last 30 days' ||
    normalized === 'older' ||
    monthNames.includes(normalized) ||
    /^[a-z]+ \d{4}$/.test(normalized)
  );
};

const getNearestSidebarSectionLabel = (anchor: HTMLAnchorElement) => {
  const nav = anchor.closest('nav');
  if (!nav) return null;

  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_ELEMENT);
  let lastSectionLabel: string | null = null;
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode === anchor) break;

    const element = currentNode as HTMLElement;
    if (!anchor.contains(element) && !element.closest('a[href*="/c/"]')) {
      const text = normalizeTitle(element.innerText || element.textContent || '');
      if (text && text.length <= 32 && isSidebarSectionLabel(text)) {
        lastSectionLabel = text;
      }
    }

    currentNode = walker.nextNode();
  }

  return lastSectionLabel;
};

const sectionLabelToDate = (label: string | null) => {
  const now = new Date();
  const normalized = normalizeTitle(label || '').toLowerCase();
  const derivedDate = new Date(now);
  derivedDate.setHours(12, 0, 0, 0);

  if (!normalized || normalized === 'today') {
    return derivedDate.toISOString();
  }

  if (normalized === 'yesterday') {
    derivedDate.setDate(derivedDate.getDate() - 1);
    return derivedDate.toISOString();
  }

  if (normalized === 'previous 7 days' || normalized === 'last 7 days') {
    derivedDate.setDate(derivedDate.getDate() - 3);
    return derivedDate.toISOString();
  }

  if (normalized === 'previous 30 days' || normalized === 'last 30 days') {
    derivedDate.setDate(derivedDate.getDate() - 15);
    return derivedDate.toISOString();
  }

  if (normalized === 'older') {
    derivedDate.setMonth(derivedDate.getMonth() - 2, 15);
    return derivedDate.toISOString();
  }

  const monthYearMatch = normalized.match(/^([a-z]+) (\d{4})$/);
  const monthName = monthYearMatch ? monthYearMatch[1] : normalized;
  const monthIndex = monthNames.indexOf(monthName);

  if (monthIndex >= 0) {
    let year = monthYearMatch ? Number(monthYearMatch[2]) : now.getFullYear();
    if (!monthYearMatch && monthIndex > now.getMonth()) {
      year -= 1;
    }
    return new Date(year, monthIndex, 15, 12, 0, 0, 0).toISOString();
  }

  return derivedDate.toISOString();
};

const getSidebarItems = () => {
  const navItems = document.querySelectorAll('nav a[href*="/c/"]');
  if (navItems.length > 0) return Array.from(navItems);
  return Array.from(document.querySelectorAll('a[href*="/c/"]'));
};

const upsertChats = (incomingChats: Record<string, ChatItem>) => {
  if (Object.keys(incomingChats).length === 0) return;

  chrome.storage.local.get(['chats'], (result: ChromeStorage) => {
    const existingChats: Record<string, ChatItem> = result.chats || {};
    const updatedChats: Record<string, ChatItem> = { ...existingChats };
    let hasChanges = false;

    Object.entries(incomingChats).forEach(([id, chat]) => {
      const existingChat = updatedChats[id];

      if (!existingChat) {
        updatedChats[id] = chat;
        hasChanges = true;
        return;
      }

      const mergedChat: ChatItem = {
        ...existingChat,
        ...chat,
        date: chat.prompts.length === 0 ? chat.date : existingChat.date || chat.date,
        prompts: chat.prompts.length > 0 ? chat.prompts : existingChat.prompts,
      };

      if (JSON.stringify(existingChat) !== JSON.stringify(mergedChat)) {
        updatedChats[id] = mergedChat;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      chrome.storage.local.set({ chats: updatedChats });
    }
  });
};

const scrapeSidebar = () => {
  const sidebarItems = getSidebarItems();
  const chats: Record<string, ChatItem> = {};

  sidebarItems.forEach((item) => {
    const anchor = item as HTMLAnchorElement;
    const url = getChatUrl(anchor.href);
    const id = extractChatId(url);
    const title = normalizeTitle(anchor.textContent || anchor.innerText || '').split('\n')[0];
    const date = sectionLabelToDate(getNearestSidebarSectionLabel(anchor));

    if (id && title && title.length > 1) {
      chats[id] = {
        id,
        title,
        url,
        date,
        prompts: [],
      };
    }
  });

  upsertChats(chats);
};

const getPromptNodes = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        'div[data-message-author-role="user"]',
        '[data-testid^="conversation-turn-"] [data-message-author-role="user"]',
        'article [data-message-author-role="user"]',
      ].join(', '),
    ),
  );

const scrapeCurrentChat = () => {
  const chatId = extractChatId(window.location.href);
  if (!chatId) return;

  const prompts = getPromptNodes()
    .map((msg) => normalizeTitle(msg.innerText))
    .filter(Boolean);

  const currentChatTitle = normalizeTitle(document.title.replace(/\s*\|\s*ChatGPT\s*$/i, '')) || 'Untitled chat';

  upsertChats({
    [chatId]: {
      id: chatId,
      title: currentChatTitle,
      url: getChatUrl(window.location.href),
      date: new Date().toISOString(),
      prompts,
    },
  });
};

const sidebarObserver = new MutationObserver(() => {
  scrapeSidebar();
});

const chatObserver = new MutationObserver(() => {
  scrapeCurrentChat();
});

const syncEverything = () => {
  scrapeSidebar();
  scrapeCurrentChat();
};

const init = () => {
  const sidebarContainer = document.querySelector('nav') || document.body;
  sidebarObserver.observe(sidebarContainer, { childList: true, subtree: true });

  const mainContainer = document.querySelector('main') || document.body;
  chatObserver.observe(mainContainer, { childList: true, subtree: true });

  syncEverything();

  [500, 1500, 3000, 5000].forEach((delay) => {
    window.setTimeout(syncEverything, delay);
  });
};

init();

let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    syncEverything();
  }
}, 1000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'history-organizer:sync') {
    syncEverything();
    sendResponse({ ok: true });
  }
});
