export interface ChatItem {
  id: string;
  title: string;
  url: string;
  date: string; // ISO string
  prompts: string[];
  tags?: string[];
  isBookmarked?: boolean;
}

export interface ChromeStorage {
  chats?: Record<string, ChatItem>;
}
