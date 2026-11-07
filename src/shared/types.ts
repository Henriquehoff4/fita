export type VideoCodec = 'h264' | 'h265' | 'av1' | 'vp9' | 'vp8' | 'other' | 'unknown';
export type AudioCodec = 'aac' | 'opus' | 'mp3' | 'vorbis' | 'flac' | 'ac3' | 'other' | 'unknown';
export type Container = 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' | 'opus' | 'source';

export interface Stream {
  id: string;
  kind: 'video' | 'audio' | 'combined';
  ext: string;
  quality: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  vcodec: VideoCodec | null;
  hdr: boolean;
  acodec: AudioCodec | null;
  abr: number | null;
  tbr: number | null;
  size: number | null;
  sizeExact: boolean;
  language: string | null;
  languageRank: number;
  direct: boolean;
}

export interface VideoInfo {
  url: string;
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  platform: string;
  uploader: string | null;
  fromPlaylist: boolean;
  streams: Stream[];
}

export interface PlanSegment {
  key: 'video' | 'audio' | 'both';
  label: string;
  formatId: string;
  bytes: number | null;
}

export interface DownloadPlan {
  mode: 'video' | 'audio';
  formatIds: string[];
  container: Container;
  mp3Bitrate?: number;
  tag: string;
  summary: string;
  size: number | null;
  sizeExact: boolean;
  segments: PlanSegment[];
  finalize: boolean;
}

export type QueueStatus = 'queued' | 'downloading' | 'finalizing' | 'done' | 'error' | 'canceled';

export interface FitaError {
  code: string;
  title: string;
  hint: string;
  detail?: string;
}

export interface QueueItem {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  platform: string;
  plan: DownloadPlan;
  status: QueueStatus;
  segmentFractions: number[];
  fraction: number;
  stage: string;
  speed: number | null;
  eta: number | null;
  downloaded: number | null;
  total: number | null;
  filePath?: string;
  error?: FitaError;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  platform: string;
  summary: string;
  size: number | null;
  filePath: string;
  finishedAt: string;
  exists?: boolean;
}

export type CookieBrowser = 'none' | 'firefox' | 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi';

export interface Settings {
  folder: string;
  concurrency: number;
  cookies: CookieBrowser;
}

export interface ToolState {
  found: boolean;
  version: string | null;
  managed: boolean;
}

export interface ToolsStatus {
  ytdlp: ToolState;
  ffmpeg: ToolState;
  deno: ToolState;
  canInstallFfmpeg: boolean;
}

export interface InstallProgress {
  tool: 'ytdlp' | 'ffmpeg';
  phase: 'checking' | 'downloading' | 'verifying' | 'installing';
  fraction: number | null;
}

export type UpdateResult = { ok: true; updated: boolean; version: string } | { ok: false; error: FitaError };

export type AnalyzeResult = { ok: true; info: VideoInfo } | { ok: false; error: FitaError; canceled?: boolean };

export interface EnqueueRequest {
  url: string;
  title: string;
  thumbnail: string | null;
  platform: string;
  plan: DownloadPlan;
}

export interface FitaApi {
  readClipboard(): Promise<string>;
  analyze(url: string): Promise<AnalyzeResult>;
  enqueue(request: EnqueueRequest): Promise<{ ok: boolean; error?: FitaError }>;
  cancel(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  getQueue(): Promise<QueueItem[]>;
  onQueue(listener: (items: QueueItem[]) => void): () => void;
  openQueueFile(id: string): Promise<boolean>;
  showQueueFile(id: string): Promise<boolean>;
  getHistory(): Promise<HistoryEntry[]>;
  openHistoryFile(id: string): Promise<boolean>;
  showHistoryFile(id: string): Promise<boolean>;
  removeHistory(id: string): Promise<HistoryEntry[]>;
  clearHistory(): Promise<HistoryEntry[]>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  chooseFolder(): Promise<Settings>;
  openFolder(): Promise<void>;
  getTools(): Promise<ToolsStatus>;
  updateYtdlp(): Promise<UpdateResult>;
  installFfmpeg(): Promise<UpdateResult>;
  onInstallProgress(listener: (progress: InstallProgress) => void): () => void;
}
