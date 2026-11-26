import { invoke } from '@tauri-apps/api/core'
import type {
  Video,
  Channel,
  SearchVideosOutput,
  StreamResult,
  StreamUrlInput,
} from '@/lib/types'

type LanguageKey = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'es'

/** 呼叫 Tauri 命令並將結果解析為指定類型，失敗時拋出易讀錯誤 */
async function callCommand<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    // Tauri 2.x：單一結構體參數需以 input 為 key 包裝
    return (await invoke<T>(cmd, { input: args })) as T
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Tauri command "${cmd}" failed: ${message}`)
  }
}

/** 直接調用 Tauri 命令（無需 input 包裝，用於簡單參數的命令） */
async function callSimpleCommand<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  try {
    // play_with_external_player / clear_cache / check_python 等使用簡單參數，直接傳遞
    return (await invoke<T>(cmd, args)) as T
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Tauri command "${cmd}" failed: ${message}`)
  }
}

/** 搜尋影片 */
export async function searchVideos(keyword: string, maxResults?: number): Promise<Video[]> {
  const result = await callCommand<SearchVideosOutput>('search_videos', {
    keyword,
    maxResults: maxResults ?? 60,
  })
  if (!result.ok) {
    throw new Error(result.error || '搜尋失敗')
  }
  return Array.isArray(result.data) ? result.data : []
}

/** 搜尋頻道 */
export async function searchChannels(keyword: string, maxResults?: number): Promise<Channel[]> {
  const result = await callCommand<SearchVideosOutput>('search_channels', {
    keyword,
    maxResults: maxResults ?? 30,
  })
  if (!result.ok) {
    throw new Error(result.error || '搜尋頻道失敗')
  }
  return Array.isArray(result.data) ? (result.data as Channel[]) : []
}

/** 取得頻道內影片列表 */
export async function getChannelVideos(channelUrl: string): Promise<Video[]> {
  // get_channel_videos 接收字符串參數，不需要 input 包裝
  const result = await callSimpleCommand<SearchVideosOutput>('get_channel_videos', {
    channel_url: channelUrl,
  })
  if (!result.ok) {
    throw new Error(result.error || '取得頻道影片失敗')
  }
  return Array.isArray(result.data) ? (result.data as Video[]) : []
}

/** 取得串流 URL 與字幕資訊 */
export async function getStreamUrl(input: StreamUrlInput): Promise<StreamResult> {
  // Rust 端 GetStreamUrlInput 使用 #[serde(rename_all = "camelCase")]，字段需為 camelCase
  return callCommand<StreamResult>('get_stream_url', {
    videoId: input.videoId,
    resolution: input.resolution,
    subtitleLang: input.subtitleLang,
    playerType: input.playerType,
  })
}

/** 啟動外部播放器 */
export async function playWithExternalPlayer(
  videoPath: string,
  audioUrl: string | undefined | null,
  subtitlePaths: string[],
  player: 'vlc' | 'mpv',
): Promise<string> {
  // Rust 端參數為獨立字段，使用 snake_case（Tauri 預設行為）
  return callSimpleCommand<string>('play_with_external_player', {
    video_path: videoPath,
    audio_url: audioUrl ?? null,
    subtitle_paths: subtitlePaths,
    player,
  })
}

/** 清除字幕快取 */
export async function clearSubtitleCache(): Promise<boolean> {
  return callCommand<boolean>('clear_cache', {})
}

/** 檢查 Python 執行環境 */
export async function checkPythonEnvironment(): Promise<{ ok: boolean; pythonPath?: string; version?: string; error?: string }> {
  return callCommand<{ ok: boolean; python_path?: string; version?: string; error?: string }>('check_python_environment', {})
}

/** 讀取二進制檔案（用於字幕預載） */
export async function readBinaryFile(path: string): Promise<Uint8Array> {
  return callCommand<Uint8Array>('read_binary_file', { path })
}

/** 啟動外部播放器（使用 Python run19.py 的完整播放邏輯） */
export async function playVideoExternal(
  videoId: string,
  player: 'vlc' | 'mpv',
  subtitleLang: string,
  maxResolution: string,
): Promise<string> {
  // Rust 端 play_video_external 接收結構體參數，使用 camelCase
  return callCommand<string>('play_video_external', {
    videoId,
    player,
    subtitleLang,
    maxResolution,
  })
}

/** 偵測外部播放器主程式路徑（供設定頁顯示） */
export async function detectPlayers(): Promise<{ vlc: string | null; mpv: string | null }> {
  return callSimpleCommand<{ vlc: string | null; mpv: string | null }>('detect_players', {})
}

/** 將語言代碼轉換為後台端預期格式（若需要） */
export function normalizeSubtitleLang(lang: LanguageKey | 'ko' | 'de' | 'fr'): string {
  const map: Record<string, string> = {
    'zh-Hant': 'zh-Hant',
    'zh-Hans': 'zh-Hans',
    'en': 'en',
    'ja': 'ja',
    'es': 'es',
    'ko': 'ko',
    'de': 'de',
    'fr': 'fr',
    'auto': 'auto',
  }
  return map[lang] || lang
}
