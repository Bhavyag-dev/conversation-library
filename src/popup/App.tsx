import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Copy,
  Download,
  ExternalLink,
  Moon,
  RefreshCw,
  Search,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ChatItem, ChromeStorage } from '../types';

const STORAGE_KEYS = {
  chats: 'chats',
  theme: 'historyOrganizerTheme',
} as const;

const getSafeDate = (value: string) => {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const escapePdfText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const wrapPdfText = (value: string, maxChars = 88) => {
  const normalized = value.replace(/\r/g, '');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      lines.push('');
      return;
    }

    const words = trimmed.split(/\s+/);
    let current = '';

    words.forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });

    if (current) lines.push(current);
  });

  return lines;
};

const buildPdfBytes = (chats: ChatItem[], title: string) => {
  const pageWidth = 612;
  const pageHeight = 792;
  const marginX = 48;
  const topY = 744;
  const bottomY = 52;
  const lineHeight = 16;

  const pages: string[][] = [[]];
  let currentPage = pages[0];
  let currentY = topY;

  const pushLine = (text: string, fontSize = 11) => {
    if (currentY < bottomY) {
      currentPage = [];
      pages.push(currentPage);
      currentY = topY;
    }

    currentPage.push(`BT /F1 ${fontSize} Tf 1 0 0 1 ${marginX} ${currentY} Tm (${escapePdfText(text)}) Tj ET`);
    currentY -= lineHeight;
  };

  pushLine(title, 18);
  pushLine(`Created ${format(new Date(), 'PPP p')}`, 11);
  pushLine(`Chats saved: ${chats.length}`, 11);
  pushLine('', 11);

  chats.forEach((chat, chatIndex) => {
    wrapPdfText(chat.title, 70).forEach((line, index) => {
      pushLine(index === 0 ? `Title: ${line}` : `       ${line}`, index === 0 ? 14 : 12);
    });
    pushLine(`Saved: ${format(getSafeDate(chat.capturedAt || chat.date), 'PPP p')}`, 11);
    pushLine(`URL: ${chat.url}`, 10);
    pushLine(`Bookmarked: ${chat.isBookmarked ? 'Yes' : 'No'}`, 11);
    pushLine('Prompts:', 12);

    if (chat.prompts.length === 0) {
      pushLine('  - No prompts captured.', 11);
    } else {
      chat.prompts.forEach((prompt) => {
        wrapPdfText(`- ${prompt}`, 84).forEach((line) => pushLine(`  ${line}`, 11));
      });
    }

    if (chat.notes?.trim()) {
      pushLine('Notes:', 12);
      wrapPdfText(chat.notes, 84).forEach((line) => pushLine(`  ${line}`, 11));
    }

    if (chatIndex < chats.length - 1) {
      pushLine('', 11);
      pushLine('------------------------------------------------------------', 10);
      pushLine('', 11);
    }
  });

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontObjectId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds: number[] = [];

  const contentObjectIds = pages.map((lines) => {
    const stream = lines.join('\n');
    return addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  const pagesObjectIdPlaceholder = objects.length + 2 + pages.length;

  pages.forEach((_lines, index) => {
    const pageObjectId = addObject(
      `<< /Type /Page /Parent ${pagesObjectIdPlaceholder} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`,
    );
    pageObjectIds.push(pageObjectId);
  });

  const pagesObjectId = addObject(`<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const catalogObjectId = addObject(`<< /Type /Catalog /Pages ${pagesObjectId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  objects.forEach((body, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
};

const App: React.FC = () => {
  const [chats, setChats] = useState<Record<string, ChatItem>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Open a conversation and save it here');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadChats = () => {
    chrome.storage.local.get([STORAGE_KEYS.chats], (result: ChromeStorage) => {
      const nextChats = result.chats || {};
      setChats(nextChats);

      if (selectedChatId && !nextChats[selectedChatId]) {
        setSelectedChatId(null);
      }
    });
  };

  const saveChats = (nextChats: Record<string, ChatItem>) => {
    setChats(nextChats);
    chrome.storage.local.set({ chats: nextChats });
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
      if (savedTheme === 'dark') {
        setIsDarkMode(true);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.theme, isDarkMode ? 'dark' : 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      loadChats();

      const handleStorageChange = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ) => {
        if (areaName === 'local' && changes.chats) {
          const nextChats = (changes.chats.newValue as Record<string, ChatItem>) || {};
          setChats(nextChats);
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);

      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (!feedbackMessage) return;

    const timeout = window.setTimeout(() => {
      setFeedbackMessage(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [feedbackMessage]);

  const upsertChat = (chat: ChatItem) => {
    const existing = chats[chat.id];
    const nextChats = {
      ...chats,
      [chat.id]: {
        ...existing,
        ...chat,
        prompts: chat.prompts.length > 0 ? chat.prompts : existing?.prompts || [],
        capturedAt: new Date().toISOString(),
      },
    };

    saveChats(nextChats);
    setSelectedChatId(chat.id);
  };

  const captureCurrentChat = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    setIsCapturing(true);
    setStatusLabel('Capturing current chat...');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      const activeTabId = activeTab?.id;
      const activeTabUrl = activeTab?.url || '';
      const isSupportedPage =
        activeTabUrl.startsWith('https://chatgpt.com/') ||
        activeTabUrl.startsWith('https://chat.openai.com/');

      if (!activeTabId || !isSupportedPage) {
        setIsCapturing(false);
        setStatusLabel('Open a conversation first');
        return;
      }

      chrome.tabs.sendMessage(activeTabId, { type: 'history-organizer:capture-current-chat' }, (response) => {
        if (chrome.runtime.lastError) {
          setIsCapturing(false);
          setStatusLabel('Reload the tab and try again');
          return;
        }

        const chat = response?.chat as ChatItem | undefined;
        if (!response?.ok || !chat) {
          setIsCapturing(false);
          setStatusLabel('Open a saved conversation, not the empty home screen');
          return;
        }

        upsertChat(chat);
        setIsCapturing(false);
        setStatusLabel(`Saved ${chat.title}`);
        setFeedbackMessage('Chat saved locally');
      });
    });
  };

  const filteredChats = useMemo<ChatItem[]>(() => {
    let result: ChatItem[] = Object.values(chats);
    const query = deferredSearchQuery.trim().toLowerCase();

    if (query) {
      result = result.filter((chat) => {
        const promptMatch = chat.prompts.some((prompt) => prompt.toLowerCase().includes(query));
        const notesMatch = (chat.notes || '').toLowerCase().includes(query);
        return chat.title.toLowerCase().includes(query) || promptMatch || notesMatch;
      });
    }

    if (showBookmarksOnly) {
      result = result.filter((chat) => chat.isBookmarked);
    }

    return [...result].sort((a, b) => {
      const aTime = getSafeDate(a.capturedAt || a.date).getTime();
      const bTime = getSafeDate(b.capturedAt || b.date).getTime();
      return bTime - aTime;
    });
  }, [chats, deferredSearchQuery, showBookmarksOnly]);

  const stats = useMemo(() => {
    const items: ChatItem[] = Object.values(chats);
    return {
      totalChats: items.length,
      bookmarked: items.filter((chat) => chat.isBookmarked).length,
      totalPrompts: items.reduce((count, chat) => count + chat.prompts.length, 0),
    };
  }, [chats]);

  const exportData = (formatType: 'json' | 'pdf') => {
    const data: ChatItem[] = selectedChat ? [selectedChat] : Object.values(chats);

    if (formatType === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = selectedChat ? `${selectedChat.title.slice(0, 50) || 'chat'}.json` : 'chatgpt-prompt-library.json';
      anchor.click();
      URL.revokeObjectURL(url);
      setFeedbackMessage('Exported JSON');
      return;
    }

    if (data.length === 0) {
      setFeedbackMessage('Save a chat before exporting PDF');
      return;
    }

    const sortedData = [...data].sort(
      (a, b) => getSafeDate(b.capturedAt || b.date).getTime() - getSafeDate(a.capturedAt || a.date).getTime(),
    );
    const pdfTitle = selectedChat ? `Conversation Export: ${selectedChat.title}` : 'Conversation Library';
    const pdfBytes = buildPdfBytes(sortedData, pdfTitle);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = selectedChat
      ? `${selectedChat.title.replace(/[<>:"/\\|?*]+/g, '').slice(0, 60) || 'chat-export'}.pdf`
      : 'chatgpt-prompt-library.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedbackMessage(selectedChat ? 'Downloaded current chat PDF' : 'Downloaded library PDF');
  };

  const deleteChat = (id: string) => {
    const nextChats = { ...chats };
    delete nextChats[id];
    saveChats(nextChats);
    setSelectedChatId((currentId) => (currentId === id ? null : currentId));
  };

  const toggleBookmark = (id: string) => {
    const nextChats = {
      ...chats,
      [id]: {
        ...chats[id],
        isBookmarked: !chats[id].isBookmarked,
      },
    };
    saveChats(nextChats);
  };

  const updateNotes = (id: string, notes: string) => {
    const nextChats = {
      ...chats,
      [id]: {
        ...chats[id],
        notes,
      },
    };
    saveChats(nextChats);
  };

  const copyPrompts = async (chat: ChatItem) => {
    const text = chat.prompts.join('\n\n');
    if (!text) {
      setFeedbackMessage('No prompts saved for this chat');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedbackMessage('Prompts copied');
    } catch {
      setFeedbackMessage('Clipboard blocked');
    }
  };

  const selectedChat = selectedChatId ? chats[selectedChatId] : null;
  const shellClasses = isDarkMode
    ? 'bg-[#0d1117] text-zinc-100'
    : 'bg-[#f7f7f3] text-zinc-900';
  const panelClasses = isDarkMode
    ? 'border-white/10 bg-white/5'
    : 'border-black/5 bg-white/80';
  const subduedText = isDarkMode ? 'text-zinc-400' : 'text-zinc-500';
  const secondarySurface = isDarkMode ? 'bg-white/6 hover:bg-white/10' : 'bg-black/[0.04] hover:bg-black/[0.06]';

  return (
    <div className={`relative h-[640px] w-[430px] overflow-hidden ${shellClasses}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_42%)]" />
      <div className="relative flex h-full flex-col">
        <header className={`border-b px-4 pb-4 pt-4 ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-[0_12px_30px_rgba(16,185,129,0.35)]">
                <BookOpen size={18} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Conversation Library</h1>
                <p className={`text-xs ${subduedText}`}>{statusLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={captureCurrentChat}
                className="rounded-xl bg-emerald-500 p-2 text-white transition hover:bg-emerald-600"
                title="Save current chat"
              >
                <RefreshCw size={17} className={isCapturing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setIsDarkMode((value) => !value)}
                className={`rounded-xl border p-2 transition ${panelClasses}`}
                title="Toggle theme"
              >
                {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <div className="flex overflow-hidden rounded-xl border shadow-sm">
                <button
                  onClick={() => exportData('json')}
                  className={`px-3 py-2 text-xs font-medium transition ${secondarySurface}`}
                  title="Export JSON"
                >
                  JSON
                </button>
                <button
                  onClick={() => exportData('pdf')}
                  className={`border-l px-3 py-2 text-xs font-medium transition ${secondarySurface} ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}
                  title="Export PDF"
                >
                  PDF
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={captureCurrentChat}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            <BookOpen size={16} />
            Save Current Chat
          </button>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Saved Chats</p>
              <p className="mt-2 text-2xl font-semibold">{stats.totalChats}</p>
            </div>
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Bookmarked</p>
              <p className="mt-2 text-2xl font-semibold">{stats.bookmarked}</p>
            </div>
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Prompts</p>
              <p className="mt-2 text-2xl font-semibold">{stats.totalPrompts}</p>
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {selectedChat ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className={`flex items-center gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
                <button
                  onClick={() => setSelectedChatId(null)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${panelClasses}`}
                >
                  Back
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{selectedChat.title}</h2>
                  <p className={`text-xs ${subduedText}`}>
                    Saved {format(getSafeDate(selectedChat.capturedAt || selectedChat.date), 'PPP p')}
                  </p>
                </div>
                <button
                  onClick={() => toggleBookmark(selectedChat.id)}
                  className={`rounded-xl border p-2 transition ${panelClasses}`}
                  title="Toggle bookmark"
                >
                  <Star size={16} fill={selectedChat.isBookmarked ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
                <div className={`rounded-2xl border p-3 ${panelClasses}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Saved Conversation</p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedChat.prompts.length} saved {selectedChat.prompts.length === 1 ? 'prompt' : 'prompts'}
                      </p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[11px] font-medium ${secondarySurface}`}>
                      {format(getSafeDate(selectedChat.capturedAt || selectedChat.date), 'MMM d')}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => copyPrompts(selectedChat)}
                    className="flex-1 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-600"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Copy size={16} />
                      Copy Prompts
                    </span>
                  </button>
                  <a
                    href={selectedChat.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${panelClasses}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ExternalLink size={16} />
                      Open
                    </span>
                  </a>
                </div>

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${subduedText}`}>Notes</h3>
                    <button
                      onClick={() => deleteChat(selectedChat.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-500 transition hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={selectedChat.notes || ''}
                    onChange={(event) => updateNotes(selectedChat.id, event.target.value)}
                    placeholder="Add your summary, ideas, or follow-up steps here"
                    className={`min-h-28 w-full rounded-2xl border p-3 text-sm outline-none ${panelClasses}`}
                  />
                </div>

                <div className="mt-5">
                  <h3 className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] ${subduedText}`}>Saved Prompts</h3>

                  {selectedChat.prompts.length > 0 ? (
                    <div className="space-y-3">
                      {selectedChat.prompts.map((prompt, index) => (
                        <div
                          key={`${selectedChat.id}-${index}`}
                          className={`rounded-2xl border p-3 text-sm leading-6 ${panelClasses}`}
                        >
                          {prompt}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`rounded-2xl border border-dashed p-4 text-sm ${panelClasses}`}>
                      <p className="font-medium">No prompts captured from this chat</p>
                      <p className={`mt-1 ${subduedText}`}>
                        Open the chat in ChatGPT so its messages are visible, then save it again.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col px-4 py-4">
              <div className="space-y-3">
                <div className={`relative overflow-hidden rounded-2xl border ${panelClasses}`}>
                  <Search className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${subduedText}`} size={16} />
                  <input
                    type="text"
                    placeholder="Search saved chats, prompts, or notes"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowBookmarksOnly(false)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      !showBookmarksOnly ? 'bg-emerald-500 text-white' : `${secondarySurface} ${subduedText}`
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setShowBookmarksOnly(true)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      showBookmarksOnly ? 'bg-amber-500 text-white' : `${secondarySurface} ${subduedText}`
                    }`}
                  >
                    Saved
                  </button>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredChats.length > 0 ? (
                  <div className="space-y-2">
                    {filteredChats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChatId(chat.id)}
                        className={`group w-full rounded-2xl border p-3 text-left transition hover:-translate-y-[1px] hover:shadow-lg ${panelClasses}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                            <BookOpen size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{chat.title}</p>
                                <p className={`mt-1 text-xs ${subduedText}`}>
                                  Saved {format(getSafeDate(chat.capturedAt || chat.date), 'MMM d')} | {chat.prompts.length} prompts
                                </p>
                                {chat.notes ? (
                                  <p className={`mt-2 line-clamp-2 text-xs ${subduedText}`}>{chat.notes}</p>
                                ) : null}
                              </div>
                              {chat.isBookmarked ? (
                                <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500">
                                  Saved
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleBookmark(chat.id);
                                }}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${secondarySurface}`}
                              >
                                <span className="inline-flex items-center gap-1">
                                  <Star size={12} fill={chat.isBookmarked ? 'currentColor' : 'none'} />
                                  {chat.isBookmarked ? 'Saved' : 'Save'}
                                </span>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  deleteChat(chat.id);
                                }}
                                className="rounded-full px-2.5 py-1 text-[11px] font-medium text-rose-500 transition hover:bg-rose-500/10"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`flex h-full flex-col items-center justify-center rounded-3xl border border-dashed px-8 text-center ${panelClasses}`}>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                      <BookOpen size={24} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">Your library is empty</h3>
                    <p className={`mt-2 text-sm ${subduedText}`}>
                      Open a conversation, then click Save Current Chat to keep its prompts locally.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        <footer className={`flex items-center justify-between border-t px-4 py-3 text-[11px] ${isDarkMode ? 'border-white/10 text-zinc-400' : 'border-black/5 text-zinc-500'}`}>
          <span>{feedbackMessage || 'Save conversations, keep notes, and export your library'}</span>
          <span className="inline-flex items-center gap-1">
            <Download size={12} />
            Local only
          </span>
        </footer>
      </div>
    </div>
  );
};

export default App;
