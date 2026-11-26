import { useEffect, useRef, useCallback, useState } from 'react'
import { init, destroy, command, setProperty, getProperty, observeProperties, listenEvents } from 'tauri-plugin-libmpv-api'
import { getStreamUrl, playVideoExternal } from '@/lib/api'
import type { StreamResult } from '@/lib/types'
import { t } from '@/lib/i18n'
import { useApp } from '@/contexts/AppContext'

interface VideoPlayerProps {
  videoId: string
  language: string
  onBack: () => void
}

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
] as const

/** mm:ss 時長顯示 */
function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '0:00'
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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
  const [internalFailed, setInternalFailed] = useState(false)
  // 內建播放器狀態與診斷
  const [timePos, setTimePos] = useState(0)
  const [duration, setDuration] = useState(0)
  const [videoVo, setVideoVo] = useState('')
  const [videoSeen, setVideoSeen] = useState(false)
  const [diagLog, setDiagLog] = useState<string[]>([])

  /** 內建播放器手動/自動備援：改用外部播放器（run19.py 邏輯，已被證實可播） */
  const launchExternal = useCallback(async () => {
    if (internalFailed || playerType !== 'internal') return
    setInternalFailed(true)
    setLoading(true)
    setError('')
    // 釋放內建播放器實例（避免佔住程序）
    void destroy().catch(() => {})
    mpvInitialized.current = false
    try {
      await playVideoExternal(videoId, externalPlayer, subtitleLanguage, maxResolution)
      setExternalLaunched(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`外部播放器啟動失敗：${message}`)
    } finally {
      setLoading(false)
    }
  }, [internalFailed, playerType, videoId, externalPlayer, subtitleLanguage, maxResolution])

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
  // 備援策略：mpv 真正出畫面的訊號是 video-reconfig 事件（smoke test 已驗證）；
  // 12 秒內沒觸發、或 end-file reason=error（403/URL 過期）→ 自動改用外部播放器視窗
  useEffect(() => {
    if (playerType === 'internal' && streamResult && playing && !mpvInitialized.current) {
      // 注意：不能在這個條件分支裡呼叫 hooks（useRef 等），會崩潰成白屏。
      // 用 effect 內的普通變數閉包保存 timer / unlisten / seen。
      let unlistenEvents: (() => void) | null = null
      let seenRef = false
      let fallbackTimer: number | null = null

      const startFallbackWatchdog = () => {
        if (fallbackTimer !== null) return
        fallbackTimer = window.setTimeout(() => {
          if (!seenRef) {
            // 內嵌顯示失敗（黑畫面）→ 自動切換外部播放器
            void launchExternal()
          }
        }, 12000)
      }

      const initMpv = async () => {
        try {
          // 與「被證實可播」的 smoke test 配置對齊：
          // - 不指定 vo（讓 mpv 依 wid 自動選可用的輸出），避免 gpu-next 缺 Vulkan 時黑屏
          // - YouTube DASH 串流必備 user-agent / referrer，否則 403 黑屏；Rust 抓不到時 fallback 瀏覽器 UA
          const initialOptions: Record<string, string | boolean | number> = {
            hwdec: 'auto-safe',
            'keep-open': 'yes',
            'force-window': 'yes',
            'user-agent': streamResult.userAgent || 'Mozilla/5.0',
            referrer: 'https://www.youtube.com',
          }
          const mpvConfig = {
            initialOptions,
            observedProperties: OBSERVED_PROPERTIES,
          }
          await init(mpvConfig)
          mpvInitialized.current = true

          await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
            if (name === 'pause') {
              setPlaying(data !== true)
            } else if (name === 'time-pos') {
              setTimePos(typeof data === 'number' ? data : 0)
            } else if (name === 'duration') {
              setDuration(typeof data === 'number' ? data : 0)
            }
          })

          // 診斷：mpv 目前用的影像輸出裝置（video-vo，例如 wid / d3d11 / ...）
          const readVideoVo = async () => {
            try {
              const v = await getProperty('video-vo', 'string')
              if (typeof v === 'string' && v) setVideoVo(v)
            } catch {
              // 讀不到就算了
            }
          }
          void readVideoVo()
          setTimeout(() => { void readVideoVo() }, 3000)
          setTimeout(() => { void readVideoVo() }, 8000)

          const audioUrl = streamResult.audioUrl ?? null
          const subs = streamResult.subtitles

          // 事件監聽：audio/sub 掛載 + 出畫面偵測 + 播放失敗偵測 + mpv log 收集
          const unlisten = await listenEvents((event) => {
            if (event.event === 'video-reconfig') {
              // 畫面真正出來了 → 取消備援看門狗
              seenRef = true
              setVideoSeen(true)
              if (fallbackTimer !== null) {
                window.clearTimeout(fallbackTimer)
                fallbackTimer = null
              }
            } else if (event.event === 'log-message') {
              // 收集 mpv 內部訊息作診斷證據（只留與影片輸出/錯誤相關的）
              const txt = String(event.text ?? '')
              if (/vo|vid|wid|window|video|error|403|fail/i.test(txt)) {
                setDiagLog((prev) => [...prev.slice(-40), `[${event.level}] ${txt.slice(0, 160)}`])
              }
            } else if (event.event === 'file-loaded') {
              void (async () => {
                try {
                  if (audioUrl) {
                    await command('audio-add', [audioUrl, 'select'])
                  }
                  for (const sub of subs) {
                    await command('sub-add', [sub.path])
                  }
                  if (subs.length > 0) {
                    await setProperty('sid', 1)
                  }
                } catch (subErr: unknown) {
                  const m = subErr instanceof Error ? subErr.message : String(subErr)
                  setError(`字幕/音訊掛載失敗：${m}`)
                } finally {
                  unlisten()
                  unlistenEvents = null
                }
              })()
            } else if (event.event === 'end-file' && event.reason === 'error') {
              // 串流播放失敗（403、URL 過期等）→ 自動切換外部播放器備援
              if (fallbackTimer !== null) {
                window.clearTimeout(fallbackTimer)
                fallbackTimer = null
              }
              void launchExternal()
            }
          })
          unlistenEvents = unlisten

          await command('loadfile', [streamResult.path, 'replace'])
          startFallbackWatchdog()
          setLoading(false)
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
          setLoading(false)
        }
      }

      initMpv()
      return () => {
        unlistenEvents?.()
        unlistenEvents = null
        if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
        void destroy().catch(() => {})
        mpvInitialized.current = false
      }
    }
  }, [playerType, streamResult, playing, launchExternal])

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
  // 備援中 / 已切換：由下方 internalFailed 區塊顯示狀態，並保留返回按鈕

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
          <button
            onClick={() => { void launchExternal() }}
            disabled={internalFailed || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={t('internalFallbackDesc', language as any)}
          >
            {t('openInExternal', language as any)}
          </button>
          <span className="text-xs px-2 py-1 rounded bg-[#18181b] border border-[#27272a] text-[#a1a1aa]">
            {t('playerInternal', language as any)}
          </span>
        </div>
      </header>

      {/* 控制列：播放/暫停 + 進度 + 診斷資訊（libmpv 是裸核心，控制 UI 需自建） */}
      {!internalFailed && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#18181b] border-b border-[#27272a]">
          <button
            onClick={() => { void command('set', ['pause', !playing]).catch(() => {}) }}
            disabled={!playing && !timePos}
            className="w-8 h-8 rounded-full bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 text-white flex items-center justify-center transition-colors"
            aria-label={playing ? 'pause' : 'play'}
          >
            {playing ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <span className="text-xs tabular-nums text-[#a1a1aa] w-11 text-right">{fmtTime(timePos)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={Math.min(timePos, duration || 0)}
            onChange={(e) => { void command('seek', [parseFloat(e.target.value), 'absolute']).catch(() => {}) }}
            className="flex-1 accent-[#a855f7] cursor-pointer h-1.5"
            aria-label="seek"
          />
          <span className="text-xs tabular-nums text-[#a1a1aa] w-11">{fmtTime(duration || null)}</span>
          {/* 診斷：mpv 影像輸出裝置 + 最近 log */}
          <details className="ml-2 text-xs">
            <summary className="cursor-pointer text-[#71717a] hover:text-[#a855f7] select-none">診斷</summary>
            <div className="mt-2 w-72 max-h-40 overflow-y-auto rounded bg-black/60 p-2 font-mono space-y-1">
              <div className="text-[#fbbf24]">
                video-vo = {videoVo || '（未知）'} ｜ videoSeen = {videoSeen ? '是' : '否'}
              </div>
              {diagLog.length === 0 ? (
                <div className="text-[#71717a]">（尚無 mpv log）</div>
              ) : (
                diagLog.map((line, idx) => (
                  <div key={idx} className="text-[#a1a1aa] break-all">{line}</div>
                ))
              )}
            </div>
          </details>
        </div>
      )}

      {error && !playing && !internalFailed && (
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
        {loading && playing && !error && !internalFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-black/80">
            <div className="w-8 h-8 rounded-full border-4 border-[#a855f7] border-t-transparent rounded-full spin mb-3" />
            <span className="text-[#a1a1aa] text-sm">{t('loadingStream', language as any)}</span>
          </div>
        )}
        {/* 備援中：隱藏黑畫面，顯示外部播放器狀態 */}
        {internalFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center bg-[#09090b] p-6">
            <div className="w-16 h-16 rounded-full bg-[#18181b] border border-[#27272a] flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#e4e4e7] mb-2">{t('internalFallbackTitle', language as any)}</h2>
            <p className="text-[#a1a1aa] text-sm mb-6 max-w-md">
              {externalLaunched ? t('internalFallbackStarted', language as any) : t('internalFallbackSwitching', language as any)}
            </p>
            <button
              onClick={onBack}
              className="px-6 py-2 rounded-lg bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 transition-colors"
            >
              {t('back', language as any)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
