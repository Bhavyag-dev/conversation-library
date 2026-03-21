import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  Calendar,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  endOfMonth,
  format,
  isThisMonth,
  isToday,
  isYesterday,
  parseISO,
  startOfMonth,
  subDays,
} from 'date-fns';
import { ChatItem, ChromeStorage } from '../types';

type DateFilter = 'all' | 'today' | 'yesterday' | 'last7' | 'month';
type SortMode = 'newest' | 'oldest' | 'title';

const dateFilterLabels: Record<DateFilter, string> = {
  all: 'All',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  month: 'This Month',
};

const STORAGE_KEYS = {
  chats: 'chats',
  theme: 'historyOrganizerTheme',
} as const;

const getSafeDate = (value: string) => {
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const App: React.FC = () => {
  const [chats, setChats] = useState<Record<string, ChatItem>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [filterDate, setFilterDate] = useState<DateFilter>('all');
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncLabel, setLastSyncLabel] = useState('Not synced yet');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadChats = () => {
    chrome.storage.local.get([STORAGE_KEYS.chats], (result: ChromeStorage) => {
      setChats(result.chats || {});
    });
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
          setLastSyncLabel(`Synced ${format(new Date(), 'p')}`);
          setIsSyncing(false);
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);

      return () => {
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    setChats({
      '1': {
        id: '1',
        title: 'React Hooks Tutorial',
        url: 'https://chatgpt.com/c/1',
        date: new Date().toISOString(),
        prompts: ['How to use useEffect?', 'What is useMemo?'],
        tags: ['react', 'hooks'],
      },
      '2': {
        id: '2',
        title: 'Tailwind CSS Tips',
        url: 'https://chatgpt.com/c/2',
        date: subDays(new Date(), 1).toISOString(),
        prompts: ['How to use grid in tailwind?', 'Tailwind arbitrary values'],
        isBookmarked: true,
      },
      '3': {
        id: '3',
        title: 'Node.js Backend',
        url: 'https://chatgpt.com/c/3',
        date: subDays(new Date(), 5).toISOString(),
        prompts: ['Express.js setup', 'Middleware in express'],
      },
    });
  }, []);

  useEffect(() => {
    if (!feedbackMessage) return;

    const timeout = window.setTimeout(() => {
      setFeedbackMessage(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [feedbackMessage]);

  const requestSync = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    setIsSyncing(true);
    setLastSyncLabel('Syncing from ChatGPT...');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      const activeTabUrl = tabs[0]?.url || '';
      const isSupportedPage =
        activeTabUrl.startsWith('https://chatgpt.com/') ||
        activeTabUrl.startsWith('https://chat.openai.com/');

      if (!activeTabId || !isSupportedPage) {
        setIsSyncing(false);
        setLastSyncLabel('Open ChatGPT to sync');
        return;
      }

      chrome.tabs.sendMessage(activeTabId, { type: 'history-organizer:sync' }, () => {
        if (chrome.runtime.lastError) {
          setIsSyncing(false);
          setLastSyncLabel('Reload ChatGPT and try again');
          return;
        }

        window.setTimeout(() => {
          setIsSyncing(false);
          setLastSyncLabel(`Synced ${format(new Date(), 'p')}`);
          loadChats();
        }, 400);
      });
    });
  };

  useEffect(() => {
    requestSync();
  }, []);

  const filteredChats = useMemo<ChatItem[]>(() => {
    let result: ChatItem[] = Object.values(chats);
    const query = deferredSearchQuery.trim().toLowerCase();

    if (query) {
      result = result.filter((chat) => {
        const promptMatch = chat.prompts.some((prompt) => prompt.toLowerCase().includes(query));
        return chat.title.toLowerCase().includes(query) || promptMatch;
      });
    }

    if (showBookmarksOnly) {
      result = result.filter((chat) => chat.isBookmarked);
    }

    result = result.filter((chat) => {
      const date = getSafeDate(chat.date);

      if (filterDate === 'today') return isToday(date);
      if (filterDate === 'yesterday') return isYesterday(date);
      if (filterDate === 'last7') return date >= subDays(new Date(), 7);
      if (filterDate === 'month') {
        const start = startOfMonth(new Date());
        const end = endOfMonth(new Date());
        return date >= start && date <= end;
      }
      return true;
    });

    const sorted: ChatItem[] = [...result];

    if (sortMode === 'title') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'oldest') {
      sorted.sort((a, b) => getSafeDate(a.date).getTime() - getSafeDate(b.date).getTime());
    } else {
      sorted.sort((a, b) => getSafeDate(b.date).getTime() - getSafeDate(a.date).getTime());
    }

    return sorted;
  }, [chats, deferredSearchQuery, filterDate, showBookmarksOnly, sortMode]);

  const groupedChats = useMemo<Record<string, ChatItem[]>>(() => {
    return filteredChats.reduce<Record<string, ChatItem[]>>((groups, chat) => {
      const date = getSafeDate(chat.date);
      let groupName = format(date, 'MMMM yyyy');

      if (isToday(date)) groupName = 'Today';
      else if (isYesterday(date)) groupName = 'Yesterday';
      else if (date >= subDays(new Date(), 7)) groupName = 'Last 7 Days';
      else if (isThisMonth(date)) groupName = 'This Month';

      if (!groups[groupName]) {
        groups[groupName] = [];
      }

      groups[groupName].push(chat);
      return groups;
    }, {});
  }, [filteredChats]);

  const stats = useMemo(() => {
    const items: ChatItem[] = Object.values(chats);
    return {
      totalChats: items.length,
      bookmarked: items.filter((chat) => chat.isBookmarked).length,
      withPrompts: items.filter((chat) => chat.prompts.length > 0).length,
    };
  }, [chats]);

  const exportData = (formatType: 'json' | 'csv') => {
    const data: ChatItem[] = Object.values(chats);
    let blob: Blob;
    let filename: string;

    if (formatType === 'json') {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      filename = 'chatgpt-history.json';
    } else {
      const headers = ['ID', 'Title', 'URL', 'Date', 'Prompts', 'Bookmarked'];
      const rows = data.map((chat) => [
        chat.id,
        `"${chat.title.replace(/"/g, '""')}"`,
        chat.url,
        chat.date,
        `"${chat.prompts.join(' | ').replace(/"/g, '""')}"`,
        chat.isBookmarked ? 'Yes' : 'No',
      ]);
      const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
      blob = new Blob([csvContent], { type: 'text/csv' });
      filename = 'chatgpt-history.csv';
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedbackMessage(`Exported ${formatType.toUpperCase()}`);
  };

  const deleteChat = (id: string) => {
    const nextChats = { ...chats };
    delete nextChats[id];
    setChats(nextChats);
    setSelectedChatId((currentId) => (currentId === id ? null : currentId));
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ chats: nextChats });
    }
  };

  const toggleBookmark = (id: string) => {
    const nextChats = { ...chats };
    nextChats[id] = {
      ...nextChats[id],
      isBookmarked: !nextChats[id].isBookmarked,
    };
    setChats(nextChats);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ chats: nextChats });
    }
  };

  const copyPrompts = async (chat: ChatItem) => {
    const text = chat.prompts.join('\n\n');
    if (!text) {
      setFeedbackMessage('No prompts available yet');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedbackMessage('Prompts copied');
    } catch {
      setFeedbackMessage('Clipboard blocked');
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterDate('all');
    setShowBookmarksOnly(false);
    setSortMode('newest');
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
                <Sparkles size={18} />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">History Organizer</h1>
                <p className={`text-xs ${subduedText}`}>{lastSyncLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={requestSync}
                className={`rounded-xl border p-2 transition ${panelClasses}`}
                title="Sync now"
              >
                <RefreshCw size={17} className={isSyncing ? 'animate-spin' : ''} />
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
                  onClick={() => exportData('csv')}
                  className={`border-l px-3 py-2 text-xs font-medium transition ${secondarySurface} ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}
                  title="Export CSV"
                >
                  CSV
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Chats</p>
              <p className="mt-2 text-2xl font-semibold">{stats.totalChats}</p>
            </div>
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Bookmarked</p>
              <p className="mt-2 text-2xl font-semibold">{stats.bookmarked}</p>
            </div>
            <div className={`rounded-2xl border p-3 backdrop-blur ${panelClasses}`}>
              <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Prompted</p>
              <p className="mt-2 text-2xl font-semibold">{stats.withPrompts}</p>
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {selectedChat ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className={`flex items-center gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
                <button
                  onClick={() => setSelectedChatId(null)}
                  className={`rounded-xl border p-2 transition ${panelClasses}`}
                >
                  <ChevronRight size={18} className="rotate-180" />
                </button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{selectedChat.title}</h2>
                  <p className={`text-xs ${subduedText}`}>{format(getSafeDate(selectedChat.date), 'PPP p')}</p>
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
                      <p className={`text-[11px] uppercase tracking-[0.18em] ${subduedText}`}>Conversation</p>
                      <p className="mt-1 text-sm font-medium">
                        {selectedChat.prompts.length} saved {selectedChat.prompts.length === 1 ? 'prompt' : 'prompts'}
                      </p>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[11px] font-medium ${secondarySurface}`}>
                      {format(getSafeDate(selectedChat.date), 'MMM d')}
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
                    <h3 className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${subduedText}`}>User Prompts</h3>
                    <button
                      onClick={() => deleteChat(selectedChat.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-500 transition hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  </div>

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
                      <p className="font-medium">No prompts extracted yet</p>
                      <p className={`mt-1 ${subduedText}`}>
                        Open this chat in ChatGPT and press refresh so the content script can capture your user messages.
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
                    placeholder="Search chats or prompt text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent py-3 pl-10 pr-4 text-sm outline-none placeholder:text-zinc-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                    {(Object.keys(dateFilterLabels) as DateFilter[]).map((key) => (
                      <button
                        key={key}
                        onClick={() => setFilterDate(key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          filterDate === key
                            ? 'bg-emerald-500 text-white'
                            : `${secondarySurface} ${subduedText}`
                        }`}
                      >
                        {dateFilterLabels[key]}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowBookmarksOnly((value) => !value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      showBookmarksOnly ? 'bg-amber-500 text-white' : `${secondarySurface} ${subduedText}`
                    }`}
                  >
                    Saved
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`flex flex-1 items-center gap-2 rounded-2xl border px-3 py-2 text-xs ${panelClasses}`}>
                    {sortMode === 'title' ? <ArrowDownAZ size={14} /> : <Calendar size={14} />}
                    <select
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                      className="w-full bg-transparent outline-none"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="title">Title A-Z</option>
                    </select>
                  </div>
                  <button
                    onClick={resetFilters}
                    className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${panelClasses}`}
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                {filteredChats.length > 0 ? (
                  <div className="space-y-5">
                    {(Object.entries(groupedChats) as [string, ChatItem[]][]).map(([groupName, groupChats]) => (
                      <div key={groupName}>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${subduedText}`}>{groupName}</h3>
                          <span className={`text-[11px] ${subduedText}`}>{groupChats.length}</span>
                        </div>
                        <div className="space-y-2">
                          {groupChats.map((chat) => (
                            <button
                              key={chat.id}
                              onClick={() => setSelectedChatId(chat.id)}
                              className={`group w-full rounded-2xl border p-3 text-left transition hover:-translate-y-[1px] hover:shadow-lg ${panelClasses}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                                  <Sparkles size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold">{chat.title}</p>
                                      <p className={`mt-1 text-xs ${subduedText}`}>
                                        {format(getSafeDate(chat.date), 'MMM d')} | {chat.prompts.length} prompts
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {chat.isBookmarked ? (
                                        <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-500">
                                          Saved
                                        </span>
                                      ) : null}
                                      <ChevronRight
                                        size={16}
                                        className={`transition ${subduedText} group-hover:translate-x-0.5`}
                                      />
                                    </div>
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
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex h-full flex-col items-center justify-center rounded-3xl border border-dashed px-8 text-center ${panelClasses}`}>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                      <Search size={24} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold">Nothing matches yet</h3>
                    <p className={`mt-2 text-sm ${subduedText}`}>
                      Try a different search, clear filters, or sync while the ChatGPT sidebar is visible.
                    </p>
                    <button
                      onClick={resetFilters}
                      className="mt-4 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>

        <footer className={`flex items-center justify-between border-t px-4 py-3 text-[11px] ${isDarkMode ? 'border-white/10 text-zinc-400' : 'border-black/5 text-zinc-500'}`}>
          <span>{feedbackMessage || 'Search, save, sync, and export your ChatGPT history'}</span>
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
