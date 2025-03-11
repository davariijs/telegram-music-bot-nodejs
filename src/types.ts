export interface VideoFormat {
  format_id: string;
  height: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  format_note?: string;
  ext?: string;
}

export interface CountResult {
  count: number;
}

export interface SearchResult {
  search_query: string;
  count: number;
}

export interface UserStats {
  totalUsers: CountResult;
  activeToday: CountResult;
  activeWeek: CountResult;
  popularSearches: SearchResult[];
}

export interface FeedbackMessage {
  id: number;
  user_id: number;
  message: string;
  timestamp: string;
  status: string;
  first_name?: string;
  username?: string;
}

export interface UserSession {
  searchResults?: any[] | null;
  lastSearchQuery?: string | null;
  selectedVideoId?: string | null;
  selectedVideoTitle?: string | null;
  videoFormats?: VideoFormat[] | null;
}


export interface BotState {
  sessions: Map<number, UserSession>;
  feedbackState: Map<number, string>;
  broadcastState: Map<number, string>;
}

export interface DownloadResult {
  filePath?: string;
  error?: Error;
}

export interface SearchResultItem {
  id: string;
  title: string;
  thumbnails?: any[];
  description?: string;
  length?: number;
  channel?: any;
}