import { createContext, useContext, useCallback, useState, useMemo, useEffect, type ReactNode } from 'react'
import type {
  AppSettings,
  AppLanguage,
  MediaType,
  MaxResolution,
  SubtitleLanguage,
  PlayerType,
  ExternalPlayer,
  ViewState,
  Video,
  Channel,
} from '@/lib/types'
import { languageNames } from '@/lib/i18n'
import { clearSubtitleCache as apiClearSubtitleCache } from '@/lib/api'

const SEARCH_HISTORY_VIDEOS_KEY = 'noadyt-search-history-videos'
const SEARCH_HISTORY_CHANNELS_KEY = 'noadyt-search-history-channels'
const SEARCH_STATE_KEY = 'noadyt-search-state'
const SETTINGS_KEY = 'noadyt-settings'
const MAX_HISTORY = 20

interface SearchState {
  /** 目前顯示在搜尋框的內容（搜尋開始後即清空，讓下拉歷史收起來） */
  query: string
  /** 這次搜尋實際使用的關鍵字（供狀態列顯示，搜尋後保留） */
  lastQuery: string
  /** 搜尋結果（影片或頻道） */
  results: (Video | Channel)[]
  /** 搜尋耗時（毫秒），null = 尚未搜尋 */
  elapsedMs: number | null
  /** 結果對應的媒體類型，避免切換類型後顯示錯誤的列表 */
  resultMediaType: MediaType | null
}

function loadSearchHistory(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function saveSearchHistory(key: string, history: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history))
  } catch {
    // ignore
  }
}

function loadSearchState(): SearchState {
  try {
    const raw = localStorage.getItem(SEARCH_STATE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SearchState>
      return {
        query: typeof parsed.query === 'string' ? parsed.query : '',
        lastQuery: typeof parsed.lastQuery === 'string' ? parsed.lastQuery : '',
        results: Array.isArray(parsed.results) ? parsed.results : [],
        elapsedMs: typeof parsed.elapsedMs === 'number' ? parsed.elapsedMs : null,
        resultMediaType: parsed.resultMediaType === 'videos' || parsed.resultMediaType === 'channels' ? parsed.resultMediaType : null,
      }
    }
  } catch {
    // ignore
  }
  return { query: '', lastQuery: '', results: [], elapsedMs: null, resultMediaType: null }
}

function saveSearchState(state: SearchState): void {
  try {
    // 只持久化必要欄位（結果列表可能很大，也存下來讓「返回時保留」跨 App 重啟）
    localStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

function loadSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AppSettings
  } catch {
    return null
  }
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh-Hant',
  mediaType: 'videos',
  maxResolution: 'auto',
  subtitleLanguage: 'auto',
  playerType: 'internal',
  externalPlayer: 'vlc',
  searchLimit: 60,
  channelLimit: 30,
}

interface AppContextValue {
  settings: AppSettings
  view: ViewState | null
  searchHistoryVideos: string[]
  searchHistoryChannels: string[]
  searchState: SearchState
  isSettingsOpen: boolean
  playbackPool: Video[]
  exitWarned: boolean
  lastBackPress: number
  lastChannel: Channel | null

  setView: (view: ViewState | null) => void
  setIsSettingsOpen: (open: boolean) => void

  // 搜尋狀態（提升到全域，頁面切換不丢失）
  setSearchQuery: (query: string) => void
  setSearchLastQuery: (query: string) => void
  setSearchResults: (results: (Video | Channel)[]) => void
  setSearchElapsed: (ms: number | null) => void
  setSearchResultMediaType: (type: MediaType | null) => void

  // 設定
  setLanguage: (lang: AppLanguage) => void
  setMediaType: (type: MediaType) => void
  setMaxResolution: (res: MaxResolution) => void
  setSubtitleLanguage: (lang: SubtitleLanguage) => void
  setPlayerType: (type: PlayerType) => void
  setExternalPlayer: (player: ExternalPlayer) => void
  setSearchLimit: (limit: number) => void
  setChannelLimit: (limit: number) => void
  saveCurrentSettings: () => void

  clearSubtitleCache: () => Promise<boolean>

  // 搜尋歷史（分離影片/頻道）
  addToSearchHistory: (keyword: string, mediaType: MediaType) => void
  removeFromSearchHistory: (keyword: string, mediaType: MediaType) => void
  clearSearchHistory: (mediaType: MediaType) => void

  // 播放池
  setPlaybackPool: (videos: Video[]) => void

  // 雙擊退出確認
  setExitWarned: (warned: boolean) => void
  setLastBackPress: (time: number) => void

  // 最後選中的頻道
  setLastChannel: (channel: Channel | null) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings() || DEFAULT_SETTINGS)
  const [view, setView] = useState<ViewState | null>({ id: 'home' })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [searchHistoryVideos, setSearchHistoryVideos] = useState<string[]>(() => loadSearchHistory(SEARCH_HISTORY_VIDEOS_KEY))
  const [searchHistoryChannels, setSearchHistoryChannels] = useState<string[]>(() => loadSearchHistory(SEARCH_HISTORY_CHANNELS_KEY))
  const [searchState, setSearchState] = useState<SearchState>(() => loadSearchState())
  const [playbackPool, setPlaybackPool] = useState<Video[]>([])
  const [exitWarned, setExitWarned] = useState(false)
  const [lastBackPress, setLastBackPress] = useState<number>(0)
  const [lastChannel, setLastChannel] = useState<Channel | null>(null)

  // 設定變動即持久化（含每次修改自動存檔）
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // 搜尋歷史變動即持久化
  useEffect(() => {
    saveSearchHistory(SEARCH_HISTORY_VIDEOS_KEY, searchHistoryVideos)
  }, [searchHistoryVideos])

  useEffect(() => {
    saveSearchHistory(SEARCH_HISTORY_CHANNELS_KEY, searchHistoryChannels)
  }, [searchHistoryChannels])

  // 搜尋狀態變動即持久化（返回/重啟後仍可恢復）
  useEffect(() => {
    saveSearchState(searchState)
  }, [searchState])

  const setSearchQuery = useCallback((query: string) => {
    setSearchState((prev) => ({ ...prev, query }))
  }, [])

  const setSearchLastQuery = useCallback((query: string) => {
    setSearchState((prev) => ({ ...prev, lastQuery: query }))
  }, [])

  const setSearchResults = useCallback((results: (Video | Channel)[]) => {
    setSearchState((prev) => ({ ...prev, results }))
  }, [])

  const setSearchElapsed = useCallback((ms: number | null) => {
    setSearchState((prev) => ({ ...prev, elapsedMs: ms }))
  }, [])

  const setSearchResultMediaType = useCallback((type: MediaType | null) => {
    setSearchState((prev) => ({ ...prev, resultMediaType: type }))
  }, [])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const setLanguage = useCallback((lang: AppLanguage) => updateSetting('language', lang), [updateSetting])
  const setMediaType = useCallback((type: MediaType) => updateSetting('mediaType', type), [updateSetting])
  const setMaxResolution = useCallback((res: MaxResolution) => updateSetting('maxResolution', res), [updateSetting])
  const setSubtitleLanguage = useCallback((lang: SubtitleLanguage) => updateSetting('subtitleLanguage', lang), [updateSetting])
  const setPlayerType = useCallback((type: PlayerType) => updateSetting('playerType', type), [updateSetting])
  const setExternalPlayer = useCallback((player: ExternalPlayer) => updateSetting('externalPlayer', player), [updateSetting])
  const setSearchLimit = useCallback((limit: number) => updateSetting('searchLimit', limit), [updateSetting])
  const setChannelLimit = useCallback((limit: number) => updateSetting('channelLimit', limit), [updateSetting])

  const saveCurrentSettings = useCallback(() => {
    saveSettings(settings)
  }, [settings])

  const clearSubtitleCache = useCallback(async () => {
    return apiClearSubtitleCache()
  }, [])

  const addToSearchHistory = useCallback((keyword: string, mediaType: MediaType) => {
    const trimmed = keyword.trim()
    if (!trimmed) return
    if (mediaType === 'videos') {
      setSearchHistoryVideos((prev) => {
        const filtered = prev.filter((item) => item !== trimmed)
        return [trimmed, ...filtered].slice(0, MAX_HISTORY)
      })
    } else {
      setSearchHistoryChannels((prev) => {
        const filtered = prev.filter((item) => item !== trimmed)
        return [trimmed, ...filtered].slice(0, MAX_HISTORY)
      })
    }
  }, [])

  const removeFromSearchHistory = useCallback((keyword: string, mediaType: MediaType) => {
    if (mediaType === 'videos') {
      setSearchHistoryVideos((prev) => prev.filter((item) => item !== keyword))
    } else {
      setSearchHistoryChannels((prev) => prev.filter((item) => item !== keyword))
    }
  }, [])

  const clearSearchHistory = useCallback((mediaType: MediaType) => {
    if (mediaType === 'videos') {
      setSearchHistoryVideos([])
    } else {
      setSearchHistoryChannels([])
    }
  }, [])

  const value = useMemo(
    () => ({
      settings,
      view,
      searchHistoryVideos,
      searchHistoryChannels,
      searchState,
      isSettingsOpen,
      playbackPool,
      exitWarned,
      lastBackPress,
      lastChannel,
      setView,
      setIsSettingsOpen,
      setSearchQuery,
      setSearchLastQuery,
      setSearchResults,
      setSearchElapsed,
      setSearchResultMediaType,
      setLanguage,
      setMediaType,
      setMaxResolution,
      setSubtitleLanguage,
      setPlayerType,
      setExternalPlayer,
      setSearchLimit,
      setChannelLimit,
      saveCurrentSettings,
      clearSubtitleCache,
      addToSearchHistory,
      removeFromSearchHistory,
      clearSearchHistory,
      setPlaybackPool,
      setExitWarned,
      setLastBackPress,
      setLastChannel,
    }),
    [
      settings,
      view,
      searchHistoryVideos,
      searchHistoryChannels,
      searchState,
      isSettingsOpen,
      playbackPool,
      exitWarned,
      lastBackPress,
      lastChannel,
      setView,
      setIsSettingsOpen,
      setSearchQuery,
      setSearchLastQuery,
      setSearchResults,
      setSearchElapsed,
      setSearchResultMediaType,
      setLanguage,
      setMediaType,
      setMaxResolution,
      setSubtitleLanguage,
      setPlayerType,
      setExternalPlayer,
      setSearchLimit,
      setChannelLimit,
      saveCurrentSettings,
      clearSubtitleCache,
      addToSearchHistory,
      removeFromSearchHistory,
      clearSearchHistory,
      setPlaybackPool,
      setExitWarned,
      setLastBackPress,
      setLastChannel,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}

export const RESOLUTION_OPTIONS: { value: MaxResolution; labelKey: string }[] = [
  { value: 'auto', labelKey: 'resAuto' },
  { value: '1080', labelKey: 'res1080' },
  { value: '720', labelKey: 'res720' },
  { value: '480', labelKey: 'res480' },
  { value: '360', labelKey: 'res360' },
]

export const SUBTITLE_LANGUAGE_OPTIONS: { value: SubtitleLanguage; labelKey: string }[] = [
  { value: 'auto', labelKey: 'subAuto' },
  { value: 'none', labelKey: 'subNone' },
  { value: 'zh-Hant', labelKey: 'subZhHant' },
  { value: 'zh-Hans', labelKey: 'subZhHans' },
  { value: 'en', labelKey: 'subEn' },
  { value: 'ja', labelKey: 'subJa' },
  { value: 'ko', labelKey: 'subKo' },
  { value: 'es', labelKey: 'subEs' },
  { value: 'de', labelKey: 'subDe' },
  { value: 'fr', labelKey: 'subFr' },
]

export const INTERFACE_LANGUAGE_OPTIONS: { value: AppLanguage; labelKey: string }[] = [
  { value: 'zh-Hant', labelKey: 'langZhHant' },
  { value: 'zh-Hans', labelKey: 'langZhHans' },
  { value: 'en', labelKey: 'langEn' },
  { value: 'ja', labelKey: 'langJa' },
  { value: 'es', labelKey: 'langEs' },
]

export const EXTERNAL_PLAYER_OPTIONS: { value: ExternalPlayer; labelKey: string }[] = [
  { value: 'vlc', labelKey: 'playerVLC' },
  { value: 'mpv', labelKey: 'playerMPV' },
]

export function getLanguageName(lang: AppLanguage): string {
  return languageNames[lang]
}