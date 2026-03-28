export interface ChatItem {
  id: string;
  title: string;
  url: string;
  date: string; // ISO string
  prompts: string[];
  tags?: string[];
  isBookmarked?: boolean;
  notes?: string;
  capturedAt?: string;
}

export interface ChromeStorage {
  chats?: Record<string, ChatItem>;
}
