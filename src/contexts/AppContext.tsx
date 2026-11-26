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
} from '@/lib/types'
import { languageNames } from '@/lib/i18n'
import { clearSubtitleCache as apiClearSubtitleCache } from '@/lib/api'

const SEARCH_HISTORY_KEY = 'noadyt-search-history'
const SETTINGS_KEY = 'noadyt-settings'
const MAX_HISTORY = 20

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function saveSearchHistory(history: string[]): void {
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history))
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

interface AppState {
  settings: AppSettings
  view: ViewState | null
  isSettingsOpen: boolean
  searchHistory: string[]
  searchResults: Video[]
  currentMediaType: MediaType
  searchStartTime: number | null
}

interface AppContextValue extends AppState {
  setView: (view: ViewState | null) => void
  setIsSettingsOpen: (open: boolean) => void
  setSearchResults: (results: Video[]) => void
  setCurrentMediaType: (type: MediaType) => void
  setSearchStartTime: (time: number | null) => void
  setLanguage: (lang: AppLanguage) => void
  setMediaType: (type: MediaType) => void
  setMaxResolution: (res: MaxResolution) => void
  setSubtitleLanguage: (lang: SubtitleLanguage) => void
  setPlayerType: (type: PlayerType) => void
  setExternalPlayer: (player: ExternalPlayer) => void
  setSearchLimit: (limit: number) => void
  setChannelLimit: (limit: number) => void
  clearSubtitleCache: () => Promise<boolean>
  addToSearchHistory: (keyword: string) => void
  removeFromSearchHistory: (keyword: string) => void
  clearSearchHistory: () => void
  saveCurrentSettings: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  // Load settings from localStorage on init
  const savedSettings = loadSettings()
  const initialState: AppState = {
    settings: savedSettings || DEFAULT_SETTINGS,
    view: { id: 'home' },
    isSettingsOpen: false,
    searchHistory: loadSearchHistory(),
    searchResults: [],
    currentMediaType: savedSettings?.mediaType || 'videos',
    searchStartTime: null,
  }

  const [state, setState] = useState<AppState>(initialState)

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(state.settings)
  }, [state.settings])

  // Persist search history whenever it changes
  useEffect(() => {
    saveSearchHistory(state.searchHistory)
  }, [state.searchHistory])

  const setView = useCallback((view: ViewState | null) => {
    setState(prev => ({ ...prev, view }))
  }, [])

  const setIsSettingsOpen = useCallback((open: boolean) => {
    setState(prev => ({ ...prev, isSettingsOpen: open }))
  }, [])

  const setSearchResults = useCallback((results: Video[]) => {
    setState(prev => ({ ...prev, searchResults: results }))
  }, [])

  const setCurrentMediaType = useCallback((type: MediaType) => {
    setState(prev => ({ ...prev, currentMediaType: type }))
  }, [])

  const setSearchStartTime = useCallback((time: number | null) => {
    setState(prev => ({ ...prev, searchStartTime: time }))
  }, [])

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, [key]: value }
    }))
  }, [])

  const setLanguage = useCallback((lang: AppLanguage) => updateSetting('language', lang), [updateSetting])
  const setMediaType = useCallback((type: MediaType) => updateSetting('mediaType', type), [updateSetting])
  const setMaxResolution = useCallback((res: MaxResolution) => updateSetting('maxResolution', res), [updateSetting])
  const setSubtitleLanguage = useCallback((lang: SubtitleLanguage) => updateSetting('subtitleLanguage', lang), [updateSetting])
  const setPlayerType = useCallback((type: PlayerType) => updateSetting('playerType', type), [updateSetting])
  const setExternalPlayer = useCallback((player: ExternalPlayer) => updateSetting('externalPlayer', player), [updateSetting])
  const setSearchLimit = useCallback((limit: number) => updateSetting('searchLimit', limit), [updateSetting])
  const setChannelLimit = useCallback((limit: number) => updateSetting('channelLimit', limit), [updateSetting])

  const clearSubtitleCache = useCallback(async () => {
    return apiClearSubtitleCache()
  }, [])

  const addToSearchHistory = useCallback((keyword: string) => {
    const trimmed = keyword.trim()
    if (!trimmed) return
    setState(prev => {
      const filtered = prev.searchHistory.filter(item => item !== trimmed)
      return { ...prev, searchHistory: [trimmed, ...filtered].slice(0, MAX_HISTORY) }
    })
  }, [])

  const removeFromSearchHistory = useCallback((keyword: string) => {
    setState(prev => ({
      ...prev,
      searchHistory: prev.searchHistory.filter(item => item !== keyword)
    }))
  }, [])

  const clearSearchHistory = useCallback(() => {
    setState(prev => ({ ...prev, searchHistory: [] }))
  }, [])

  const saveCurrentSettings = useCallback(() => {
    saveSettings(state.settings)
  }, [state.settings])

  const value = useMemo(() => ({
    ...state,
    setView,
    setIsSettingsOpen,
    setSearchResults,
    setCurrentMediaType,
    setSearchStartTime,
    setLanguage,
    setMediaType,
    setMaxResolution,
    setSubtitleLanguage,
    setPlayerType,
    setExternalPlayer,
    setSearchLimit,
    setChannelLimit,
    clearSubtitleCache,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
    saveCurrentSettings,
  }), [
    state,
    setView,
    setIsSettingsOpen,
    setSearchResults,
    setCurrentMediaType,
    setSearchStartTime,
    setLanguage,
    setMediaType,
    setMaxResolution,
    setSubtitleLanguage,
    setPlayerType,
    setExternalPlayer,
    setSearchLimit,
    setChannelLimit,
    clearSubtitleCache,
    addToSearchHistory,
    removeFromSearchHistory,
    clearSearchHistory,
    saveCurrentSettings,
  ])

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
