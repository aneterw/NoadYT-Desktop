import { useState, useCallback, useRef, useEffect } from 'react'
import type { Video, Channel, MediaType } from '@/lib/types'
import { searchVideos, searchChannels } from '@/lib/api'
import { t } from '@/lib/i18n'
import { VideoCard } from '@/components/VideoCard'
import { ChannelCard } from '@/components/ChannelCard'
import { useApp } from '@/contexts/AppContext'

interface SearchTabProps {
  language: string
  mediaType: MediaType
  searchHistory: string[]
  searchStartTime: number | null
  onVideoSelect: (video: Video) => void
  onChannelSelect: (channel: Channel) => void
  addToSearchHistory: (keyword: string) => void
  removeFromSearchHistory: (keyword: string) => void
  setSearchResults: (results: Video[]) => void
  setSearchStartTime: (time: number | null) => void
  clearQuery?: () => void  // 从播放器返回时清除查询
}

function SearchTab({
  language,
  mediaType,
  searchHistory,

  searchStartTime,
  onVideoSelect,
  onChannelSelect,
  addToSearchHistory,
  removeFromSearchHistory,
  setSearchResults,
  setSearchStartTime,
  clearQuery,
}: SearchTabProps) {
  const [query, setQuery] = useState('')
  const [localResults, setLocalResults] = useState<(Video | Channel)[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchStartRef = useRef<number | null>(null)

  // 清除搜索框内容
  useEffect(() => {
    if (clearQuery) clearQuery()
  }, [])

  // Click outside to close history dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const runSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim()
    if (!trimmed) return
    addToSearchHistory(trimmed)
    searchStartRef.current = Date.now()
    setSearchStartTime(searchStartRef.current)
    setLoading(true)
    setError('')
    setLocalResults([])
    setShowHistory(false)
    try {
      let results: (Video | Channel)[]
      if (mediaType === 'videos') {
        const videos = await searchVideos(trimmed)
        results = videos
        setSearchResults(videos)
      } else {
        const channels = await searchChannels(trimmed)
        results = channels
      }
      setLocalResults(results)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
      if (searchStartRef.current) {
        const elapsed = ((Date.now() - searchStartRef.current) / 1000).toFixed(2)
        console.log(`[Search] "${trimmed}" took ${elapsed}s`)
      }
    }
  }, [mediaType, addToSearchHistory, setSearchResults, setSearchStartTime])

  const handleSearch = useCallback(() => {
    runSearch(query)
  }, [query, runSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }, [handleSearch])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    setShowHistory(searchHistory.length > 0 && val.length >= 0)
  }, [searchHistory])

  const handleInputFocus = useCallback(() => {
    setShowHistory(searchHistory.length > 0)
  }, [searchHistory])

  const handleHistoryClick = useCallback((kw: string) => {
    setQuery(kw)
    setShowHistory(false)
    runSearch(kw)
  }, [runSearch])

  const handleClearAll = useCallback(() => {
    searchHistory.forEach((item) => removeFromSearchHistory(item))
  }, [searchHistory, removeFromSearchHistory])

  const formatElapsed = (startTime: number | null): string => {
    if (!startTime) return ''
    const elapsedMs = Date.now() - startTime
    const seconds = (elapsedMs / 1000).toFixed(1)
    return `${seconds}秒`
  }

  return (
    <div className="space-y-4">
      <div className="relative" ref={containerRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleInputFocus}
              onBlur={() => setTimeout(() => setShowHistory(false), 200)}
              className="w-full px-4 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a] text-white placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all pr-16"
              placeholder={t('searchPlaceholder', language as any)}
            />
            {searchHistory.length > 0 && query === '' && (
              <button
                onClick={handleClearAll}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition-colors"
                title="清除搜尋歷史"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors whitespace-nowrap"
          >
            {loading ? t('search', language as any) + '...' : t('search', language as any)}
          </button>
        </div>

        {/* 搜尋歷史下拉清單 */}
        {showHistory && searchHistory.length > 0 && query === '' && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a]">
              <span className="text-xs text-[#a1a1aa]">{language === 'zh-Hant' ? '搜尋歷史' : language === 'zh-Hans' ? '搜索历史' : language === 'ja' ? '検索履歴' : language === 'es' ? 'Historial de búsqueda' : 'Search History'}</span>
            </div>
            <ul className="max-h-64 overflow-y-auto">
              {searchHistory.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-[#27272a] cursor-pointer transition-colors">
                  <button
                    onClick={() => handleHistoryClick(item)}
                    className="flex-1 text-left text-sm text-[#e4e4e7] truncate"
                  >
                    <svg className="inline-block w-3.5 h-3.5 mr-2 text-[#71717a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {item}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromSearchHistory(item)
                    }}
                    className="ml-2 p-1 rounded hover:bg-[#3f3f46] text-[#71717a] hover:text-red-400 transition-colors"
                    title={language === 'zh-Hant' ? '刪除' : language === 'zh-Hans' ? '删除' : language === 'ja' ? '削除' : language === 'es' ? 'Eliminar' : 'Delete'}
                    aria-label="Remove from history"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            {searchHistory.length > 0 && (
              <div className="border-t border-[#27272a] px-3 py-2">
                <button
                  onClick={handleClearAll}
                  className="text-xs text-[#71717a] hover:text-[#a855f7] transition-colors w-full text-center"
                >
                  {language === 'zh-Hant' ? '清除所有歷史記錄' : language === 'zh-Hans' ? '清除所有历史记录' : language === 'ja' ? 'すべての履歴を消去' : language === 'es' ? 'Borrar todo el historial' : 'Clear All History'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] text-sm">
          {error}
        </div>
      )}

      {loading && localResults.length === 0 && !error && (
        <div className="h-64 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 animate-pulse">
            <div className="w-8 h-8 rounded-full border-4 border-[#a855f7] border-t-transparent rounded-full spin" />
            <span className="text-[#a1a1aa] text-sm">{t('search', language as any)}中...</span>
          </div>
        </div>
      )}

      {!loading && localResults.length === 0 && !error && query.trim() === '' && (
        <div className="h-64 flex flex-col items-center justify-center text-center">
          <svg className="w-16 h-16 text-[#404045] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-[#a1a1aa]">{mediaType === 'videos' ? '輸入關鍵字開始搜尋影片' : '輸入關鍵字開始搜尋頻道'}</p>
        </div>
      )}

      {!loading && localResults.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-[#e4e4e7]">
              {t('resultsFound', language as any, { count: localResults.length })}
              {searchStartTime && (
                <span className="ml-2 text-sm font-normal text-[#a1a1aa]">
                  · {formatElapsed(searchStartTime)}
                </span>
              )}
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {localResults.map((item) => {
              if (mediaType === 'videos') {
                const v = item as Video
                return (
                  <VideoCard
                    key={v.id}
                    video={v}
                    language={language}
                    onPlay={onVideoSelect}
                    onOpenChannel={() => {}}
                  />
                )
              }
              const c = item as Channel
              return (
                <ChannelCard
                  key={c.channelId}
                  channel={c}
                  language={language}
                  onSelect={onChannelSelect}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function Home() {
  const { settings, setMediaType, setView, searchHistory, addToSearchHistory, removeFromSearchHistory,  setCurrentMediaType, setSearchResults, searchStartTime, setSearchStartTime } = useApp()
  const { language, mediaType } = settings

  const handleVideoSelect = useCallback((video: Video) => {
    setView({ id: 'player', videoId: video.id })
  }, [setView])

  const handleChannelSelect = useCallback((channel: Channel) => {
    setView({ id: 'channel', channel })
  }, [setView])

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7]">
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#a855f7] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">{t('appName', language as any)}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newType = mediaType === 'videos' ? 'channels' : 'videos'
                setMediaType(newType)
                setCurrentMediaType(newType)
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mediaType === 'videos'
                  ? 'bg-[#a855f7] text-white'
                  : 'bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:bg-[#27272a]'
              }`}
            >
              {mediaType === 'videos' ? t('channels', language as any) : t('videos', language as any)}
            </button>
            <button
              onClick={() => setView({ id: 'settings' })}
              className="w-8 h-8 rounded-lg bg-[#18181b] border border-[#27272a] flex items-center justify-center text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 transition-colors"
              title={t('settings', language as any)}
              aria-label={t('settings', language as any)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <SearchTab
          language={language}
          mediaType={mediaType}
          searchHistory={searchHistory}
          searchStartTime={searchStartTime}
          onVideoSelect={handleVideoSelect}
          onChannelSelect={handleChannelSelect}
          addToSearchHistory={addToSearchHistory}
          removeFromSearchHistory={removeFromSearchHistory}
          setSearchResults={setSearchResults}
          setSearchStartTime={setSearchStartTime}
        />
      </main>
    </div>
  )
}
