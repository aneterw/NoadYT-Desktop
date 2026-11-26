import { useState, useEffect, useCallback } from 'react'
import type { Channel, Video } from '@/lib/types'
import { getChannelVideos } from '@/lib/api'
import { t } from '@/lib/i18n'
import { VideoCard } from '@/components/VideoCard'

interface ChannelVideosProps {
  channel: Channel
  language: string
  onVideoSelect: (video: Video) => void
  onBack: () => void
}

export default function ChannelVideos({ channel, language, onVideoSelect, onBack }: ChannelVideosProps) {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const channelUrl = channel.channelId ? `https://www.youtube.com/channel/${channel.channelId}` : ''

  const loadVideos = useCallback(async () => {
    if (!channelUrl) {
      setError('無法解析頻道 URL')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await getChannelVideos(channelUrl)
      setVideos(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [channelUrl])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] flex flex-col">
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">{t('back', language as any)}</span>
        </button>
        <h1 className="mt-2 text-xl font-bold text-[#e4e4e7] leading-tight line-clamp-2">{channel.title}</h1>
        <p className="text-[#a1a1aa] text-xs mt-1">
          {channel.channelId ? `https://www.youtube.com/channel/${channel.channelId}` : ''}
        </p>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-8 h-8 rounded-full border-4 border-[#a855f7] border-t-transparent rounded-full spin mb-3" />
            <span className="text-[#a1a1aa] text-sm">載入頻道影片中...</span>
          </div>
        )}

        {!loading && error && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="px-4 py-3 rounded-lg bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] text-sm">
              {error}
            </div>
            <button
              onClick={loadVideos}
              className="mt-3 px-4 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 transition-colors text-sm"
            >
              {t('search', language as any)}
            </button>
          </div>
        )}

        {!loading && !error && videos.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <svg className="w-16 h-16 text-[#404045] mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-[#a1a1aa] text-sm">這個頻道沒有影片</p>
          </div>
        )}

        {!loading && !error && videos.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-[#e4e4e7]">
                {t('resultsFound', language as any, { count: videos.length })}
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  language={language}
                  onPlay={onVideoSelect}
                  onOpenChannel={() => {}}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
