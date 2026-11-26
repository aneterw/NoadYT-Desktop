import { useEffect, useRef, useCallback, useState } from 'react'
import { init, destroy, command, setProperty, observeProperties } from 'tauri-plugin-libmpv-api'
import { getStreamUrl, playVideoExternal } from '@/lib/api'
import type { StreamResult } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useApp } from '@/contexts/AppContext'

interface VideoPlayerProps {
  videoId: string
  language: string
  onBack: () => void
}

const OBSERVED_PROPERTIES: readonly ['pause', 'flag'][] = [['pause', 'flag']]

export default function VideoPlayer({ videoId, language, onBack }: VideoPlayerProps) {
  const { settings } = useApp()
  const { playerType, externalPlayer, maxResolution, subtitleLanguage } = settings
  const videoRef = useRef<HTMLDivElement>(null)
  const mpvInitialized = useRef(false)
  const [streamResult, setStreamResult] = useState<StreamResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [externalLaunched, setExternalLaunched] = useState(false)

  const loadStream = useCallback(async () => {
    // 外部播放器模式：完全交給 Python run19.py 邏輯處理
    // （自動偵測直播、強制 MPV、下載字幕、選取串流），不需 get_stream_url
    if (playerType === 'external') {
      setLoading(true)
      setError('')
      try {
        await playVideoExternal(videoId, externalPlayer, subtitleLanguage, maxResolution)
        setExternalLaunched(true)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      } finally {
        setLoading(false)
      }
      return
    }

    // 內建播放器模式：get_stream_url 分析串流後交給 libmpv
    setLoading(true)
    setError('')
    try {
      const result: StreamResult = await getStreamUrl({
        videoId,
        resolution: maxResolution,
        subtitleLang: subtitleLanguage,
        playerType,
      })
      setStreamResult(result)
      setPlaying(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setPlaying(false)
    } finally {
      setLoading(false)
    }
  }, [videoId, maxResolution, subtitleLanguage, playerType, externalPlayer])

  useEffect(() => {
    loadStream()
  }, [loadStream])

  // 内建播放器模式：初始化 libmpv 并加载流
  useEffect(() => {
    if (playerType === 'internal' && streamResult && playing && !mpvInitialized.current) {
      const initMpv = async () => {
        try {
          const mpvConfig = {
            initialOptions: {
              vo: 'gpu-next',
              hwdec: 'auto-safe',
              'keep-open': 'yes',
              'force-window': 'yes',
              wid: videoRef.current ? String(videoRef.current) : '',
            },
            observedProperties: OBSERVED_PROPERTIES,
          }
          await init(mpvConfig)
          mpvInitialized.current = true

          await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
            if (name === 'pause') {
              setPlaying(data !== true)
            }
          })

          await command('loadfile', [streamResult.path])

          if (streamResult.audioUrl) {
            await command('audio-file-add', [streamResult.audioUrl])
          }

          for (const sub of streamResult.subtitles) {
            await command('sub-add', [sub.path])
          }

          if (streamResult.subtitles.length > 0) {
            await setProperty('sid', 1)
          }

          setLoading(false)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
          setLoading(false)
        }
      }

      initMpv()
      return () => {
        void destroy().catch(() => {})
        mpvInitialized.current = false
      }
    }
  }, [playerType, streamResult, playing])

  if (playerType === 'external') {
    return (
      <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] flex flex-col items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#e4e4e7] mb-2">{t('playerExternal', language as any)}</h2>
          <p className="text-[#a1a1aa] mb-6">
            {loading
              ? '啟動外部播放器中...'
              : error
                ? `播放失敗：${error}`
                : externalLaunched
                  ? '外部播放器已啟動，影片將在外部播放器中播放'
                  : '外部播放器尚未啟動'}
          </p>
          <button
            onClick={onBack}
            className="px-6 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 transition-colors"
          >
            {t('back', language as any)}
          </button>
        </div>
      </div>
    )
  }

  // 内建播放器 UI
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur px-6 py-3 flex items-center justify-between z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">{t('back', language as any)}</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
            {t('playerInternal', language as any)}
          </span>
        </div>
      </header>

      {error && !playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#09090b]/90 backdrop-blur z-20">
          <div className="px-4 py-3 rounded-lg bg-[#7f1d1d] border border-[#991b1b] text-[#fca5a5] text-sm mb-3">
            {t('playFailed', language as any)}：{error}
          </div>
          <button
            onClick={onBack}
            className="px-6 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 transition-colors"
          >
            {t('back', language as any)}
          </button>
        </div>
      )}

      <div className="flex-1 relative bg-black">
        <div ref={videoRef} className="absolute inset-0 w-full h-full bg-black" />
        {loading && playing && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-black/80">
            <div className="w-8 h-8 rounded-full border-4 border-[#a855f7] border-t-transparent rounded-full spin mb-3" />
            <span className="text-[#a1a1aa] text-sm">{t('loadingStream', language as any)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
