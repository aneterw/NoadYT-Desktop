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
  query: string
  lastQuery: string
  onQueryChange: (q: string) => void
  onSearch: (q: string) => void
  searching: boolean
  error: string
  results: (Video | Channel)[]
  showResults: boolean
  resultsLabel: string
  searchHistory: string[]
  onHistoryClick: (kw: string) => void
  onRemoveHistory: (kw: string) => void
  onOpenVideo: (video: Video) => void
  onOpenChannel: (channel: Channel) => void
}

function SearchTab({
  language,
  mediaType,
  query,
  lastQuery,
  onQueryChange,
  onSearch,
  searching,
  error,
  results,
  showResults,
  resultsLabel,
  searchHistory,
  onHistoryClick,
  onRemoveHistory,
  onOpenVideo,
  onOpenChannel,
}: SearchTabProps) {
  const [showHistory, setShowHistory] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 搜尋開始（searching）或結果出現後，收起來下拉歷史，避免遮蔽畫面
  useEffect(() => {
    if (searching || showResults) setShowHistory(false)
  }, [searching, showResults])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const placeholder = mediaType === 'videos'
    ? t('searchPlaceholder', language as any)
    : t('searchChannelPlaceholder', language as any)

  // 搜尋完成後沒有結果（非搜尋中）
  const showNoResults = !searching && !error && results.length === 0

  return (
    <div className="space-y-4">
      <div className="relative" ref={containerRef}>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch(query)
            }}
            onFocus={() => setShowHistory(searchHistory.length > 0)}
            className="flex-1 px-4 py-2.5 rounded-lg bg-[#18181b] border border-[#27272a] text-white placeholder-[#71717a] focus:outline-none focus:ring-2 focus:ring-[#a855f7] transition-all"
            placeholder={placeholder}
          />
          <button
            onClick={() => onSearch(query)}
            disabled={searching}
            className="px-6 py-2.5 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors whitespace-nowrap"
          >
            {searching ? `${t('search', language as any)}...` : t('search', language as any)}
          </button>
        </div>

        {showHistory && searchHistory.length > 0 && (
          <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-[#09090b]/85 backdrop-blur-md border border-[#27272a]/80 rounded-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272a]/60">
              <span className="text-xs text-[#a1a1aa]">{t('searchHistory', language as any)}</span>
              <button
                onClick={() => searchHistory.forEach(onRemoveHistory)}
                className="text-xs text-[#71717a] hover:text-[#a855f7] transition-colors"
              >
                {t('clearHistory', language as any)}
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto">
              {searchHistory.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-[#27272a] transition-colors">
                  <button
                    onClick={() => onHistoryClick(item)}
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
                      onRemoveHistory(item)
                    }}
                    className="ml-2 p-1 rounded hover:bg-[#3f3f46] text-[#71717a] hover:text-red-400 transition-colors"
                    title={t('removeHistory', language as any)}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] text-sm space-y-1">
          <div>{error}</div>
          {/* Python 環境缺失時，導引到設定頁環境狀態 */}
          {/Python|python/i.test(error) && (
            <div className="text-xs text-[#fcd34d]">
              請到「設定 → 環境狀態」確認 Python 與必要套件是否安裝；缺套件可一鍵安裝
            </div>
          )}
        </div>
      )}

      {searching && (
        <div className="h-64 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 animate-pulse">
            <div className="w-8 h-8 rounded-full border-4 border-[#a855f7] border-t-transparent rounded-full spin" />
            <span className="text-[#a1a1aa] text-sm">
              {language === 'zh-Hant' ? '搜尋中...' : language === 'zh-Hans' ? '搜索中...' : 'Searching...'}
            </span>
          </div>
        </div>
      )}

      {showNoResults && lastQuery && (
        <div className="h-64 flex flex-col items-center justify-center text-center">
          <svg className="w-16 h-16 text-[#404045] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-[#a1a1aa]">{t('noResults', language as any)}</p>
        </div>
      )}

      {showResults && (
        <>
          {/* 搜索状态列：关键字 + 数量 + 耗时 */}
          <div>
            <h2 className="font-bold text-[#e4e4e7]">{resultsLabel}</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {mediaType === 'videos'
              ? (results as Video[]).map((v) => (
                  <VideoCard key={v.id} video={v} language={language} onPlay={onOpenVideo} />
                ))
              : (results as Channel[]).map((c) => (
                  <ChannelCard key={c.channelId} channel={c} language={language} onSelect={onOpenChannel} />
                ))}
          </div>
        </>
      )}

      {!searching && !error && !lastQuery && (
        <div className="h-64 flex flex-col items-center justify-center text-center">
          <svg className="w-16 h-16 text-[#404045] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-[#a1a1aa]">
            {mediaType === 'videos' ? t('hintSearchVideos', language as any) : t('hintSearchChannels', language as any)}
          </p>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const {
    settings,
    setMediaType,
    setView,
    searchHistory,
    searchState,
    setSearchQuery,
    setSearchLastQuery,
    setSearchResults,
    setSearchElapsed,
    setSearchResultMediaType,
    addToSearchHistory,
    removeFromSearchHistory,
  } = useApp()

  const { language, mediaType, searchLimit, channelLimit } = settings
  const { query, lastQuery, results, elapsedMs, resultMediaType } = searchState
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  // 只有当结果类型与当前媒体类型匹配时才显示列表
  const showResults = resultMediaType === mediaType && results.length > 0

  const elapsedLabel = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)}` : null

  const resultsLabel = showResults
    ? `${lastQuery ? `「${lastQuery}」 · ` : ''}${mediaType === 'videos' ? (language === 'zh-Hant' ? `找到 ${results.length} 個影片` : `找到 ${results.length} 个影片`) : (language === 'zh-Hant' ? `找到 ${results.length} 個頻道` : `找到 ${results.length} 个频道`)}${elapsedLabel ? ` · ${elapsedLabel} 秒` : ''}`
    : ''

  const runSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim()
    if (!trimmed) return
    setSearching(true)
    setError('')
    addToSearchHistory(trimmed)
    // 搜尋一開始就清空搜尋框（下拉歷史同步收起來），關鍵字記錄在 lastQuery 供狀態列顯示
    setSearchQuery('')
    setSearchLastQuery(trimmed)
    setSearchResults([])
    setSearchElapsed(null)
    setSearchResultMediaType(null)
    const started = performance.now()
    try {
      const limit = mediaType === 'videos' ? searchLimit : channelLimit
      const found = mediaType === 'videos'
        ? await searchVideos(trimmed, limit)
        : await searchChannels(trimmed, limit)
      setSearchResults(found)
      setSearchResultMediaType(mediaType)
      setSearchElapsed(performance.now() - started)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setSearchElapsed(performance.now() - started)
    } finally {
      setSearching(false)
    }
  }, [mediaType, searchLimit, channelLimit, addToSearchHistory, setSearchQuery, setSearchLastQuery, setSearchResults, setSearchElapsed, setSearchResultMediaType])

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] flex flex-col">
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
              onClick={() => setMediaType(mediaType === 'videos' ? 'channels' : 'videos')}
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

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8">
        <SearchTab
          language={language}
          mediaType={mediaType}
          query={query}
          lastQuery={lastQuery}
          onQueryChange={setSearchQuery}
          onSearch={runSearch}
          searching={searching}
          error={error}
          results={results}
          showResults={showResults}
          resultsLabel={resultsLabel}
          searchHistory={searchHistory}
          onHistoryClick={runSearch}
          onRemoveHistory={removeFromSearchHistory}
          onOpenVideo={(video) => setView({ id: 'player', videoId: video.id })}
          onOpenChannel={(channel) => setView({ id: 'channel', channel })}
        />
      </main>
    </div>
  )
}
