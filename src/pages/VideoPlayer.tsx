import { useEffect, useRef, useCallback, useState } from 'react'
import { init, destroy, command, setProperty, getProperty, observeProperties, listenEvents, setVideoMarginRatio } from 'tauri-plugin-libmpv-api'
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
  const [remaining, setRemaining] = useState(0)
  const [videoVo, setVideoVo] = useState('')
  const [videoSeen, setVideoSeen] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [diagLog, setDiagLog] = useState<string[]>([])
  // 播放控制（與 mpv 實際狀態綁定）
  const [isPaused, setIsPaused] = useState(false)
  const [audioDelay, setAudioDelay] = useState(0) // ms
  const [delayVisible, setDelayVisible] = useState(false)
  const delayTimer = useRef<number | null>(null)
  // 字幕控制
  const [subOn, setSubOn] = useState(true)
  const [subSize, setSubSize] = useState(18)
  const [subFont, setSubFont] = useState('Sans')
  const [subColor, setSubColor] = useState('#ffffff')
  const [subBg, setSubBg] = useState('#000000')

  /** 播放/暫停：用 command('set')（跟 seek 同一條已證實可動作的通道），
   *  依「目前的 isPaused」翻轉，並立刻更新按鈕圖示；後面的輪詢會與 mpv 同步修正 */
  const togglePause = useCallback(async () => {
    try {
      const wantPause = !isPaused
      await command('set', ['pause', wantPause])
      setIsPaused(wantPause)
    } catch {
      // 指令失敗：至少翻轉圖示，讓使用者知道有按到
      setIsPaused(!isPaused)
    }
  }, [isPaused])

  /** 音訊延遲調整（100ms 步進，範圍 ±3000ms），畫面上顯示 +Nms，4 秒無操作淡出 */
  const adjustAudioDelay = useCallback((deltaMs: number) => {
    setAudioDelay((prev) => {
      const next = Math.max(-3000, Math.min(3000, prev + deltaMs))
      void command('set', ['audio-delay', next / 1000]).catch(() => {})
      return next
    })
    setDelayVisible(true)
    if (delayTimer.current !== null) window.clearTimeout(delayTimer.current)
    delayTimer.current = window.setTimeout(() => setDelayVisible(false), 4000)
  }, [delayTimer])

  /** 字幕 開/關 */
  const toggleSub = useCallback(() => {
    setSubOn((prev) => {
      const next = !prev
      void command('set', ['sub', next ? 'yes' : 'no']).catch(() => {})
      return next
    })
  }, [])

  /** 字幕大小 / 字型 / 顏色 / 背景 套用（mpv 字幕屬性） */
  const applySubSize = (n: number) => {
    setSubSize(n)
    void command('set', ['sub-font-size', n]).catch(() => {})
  }
  const applySubFont = (f: string) => {
    setSubFont(f)
    void command('set', ['sub-font', f]).catch(() => {})
  }
  const applySubColor = (c: string) => {
    setSubColor(c)
    void command('set', ['sub-color', c]).catch(() => {})
  }
  const applySubBg = (c: string) => {
    setSubBg(c)
    void command('set', ['sub-back-color', c]).catch(() => {})
  }

  /** 每秒輪詢 mpv：pause 狀態 + 剩餘時間（比事件可靠，UI 常與 mpv 同步） */
  useEffect(() => {
    if (playerType !== 'internal' || !streamResult || internalFailed) return
    const timer = window.setInterval(async () => {
      if (!mpvInitialized.current) return
      try {
        const p = await getProperty('pause', 'flag')
        if (typeof p === 'boolean') setIsPaused(p)
        const r = await getProperty('remaining', 'double')
        if (typeof r === 'number' && isFinite(r)) setRemaining(Math.max(0, r))
      } catch {
        // 讀不到不影響播放
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [playerType, streamResult, internalFailed])

  /** 內建播放器手動/自動備援：改用外部播放器（run19.py 邏輯，已被證實可播） */
  const launchExternal = useCallback(async () => {
    if (internalFailed || playerType !== 'internal') return
    setInternalFailed(true)
    setLoading(true)
    setError('')
    // 先停止內建播放器（stop 讓音訊立即停下），再釋放實例，
    // 避免切換外部後內建音訊還在下播（雙音重疊）
    if (mpvInitialized.current) {
      try {
        await command('stop')
      } catch {
        // 沒建立成功就算了
      }
      try {
        await destroy()
      } catch {
        // destroy 失敗也繼續
      }
      mpvInitialized.current = false
    }
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
  // 備援策略：以屬性輪詢判定影片是否真的在播（比事件可靠）；
  // 30 秒內 video-format 仍為空 → 自動改用外部播放器視窗。
  // 播放中途的暫存錯誤（end-file reason=error）不再強切外部，只提示。
  useEffect(() => {
    if (playerType === 'internal' && streamResult && playing && !mpvInitialized.current) {
      // 注意：不能在這個條件分支裡呼叫 hooks（useRef 等），會崩潰成白屏。
      // 用 effect 內的普通變數閉包保存 timer / unlisten / seen。
      let unlistenEvents: (() => void) | null = null
      let seenRef = false
      let fileLoadedDone = false
      let fallbackTimer: number | null = null
      let videoCheckTimer: number | null = null

      const markVideoReady = () => {
        seenRef = true
        setVideoSeen(true)
        setVideoReady(true)
        if (fallbackTimer !== null) {
          window.clearTimeout(fallbackTimer)
          fallbackTimer = null
        }
      }

      // 備援看門狗：30 秒內若 video-format 仍是空（沒解出影片）才切外部
      const startFallbackWatchdog = () => {
        if (fallbackTimer !== null) return
        fallbackTimer = window.setTimeout(() => {
          if (!seenRef) void launchExternal()
        }, 30000)
      }

      // 屬性輪詢：video-format 非空 = 影片已解碼；time-pos 前進 = 播放中
      const startVideoPolling = () => {
        if (videoCheckTimer !== null) return
        let lastTime = -1
        const tick = async () => {
          if (seenRef) return
          try {
            const vf = await getProperty('video-format', 'string')
            const fmt = vf == null ? '' : Array.isArray(vf) ? vf.join('|') : String(vf)
            if (fmt && fmt !== 'null') {
              markVideoReady()
              return
            }
            const tp = await getProperty('time-pos', 'double')
            const t = typeof tp === 'number' ? tp : 0
            if (t > 0 && t !== lastTime) {
              // 播放位置在推進，影片已在解碼
              markVideoReady()
              return
            }
            lastTime = t
          } catch {
            // 讀不到屬性不影響輪詢
          }
          videoCheckTimer = window.setTimeout(tick, 2000)
        }
        void tick()
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

          // 影片畫面縮到「標題列與控制列之間」，讓上下 UI 不被 mpv 嵌入視窗蓋住
          // （比例依視窗高度：頂端約 5% 給 header、底端約 7% 給控制列）
          try {
            await setVideoMarginRatio({ top: 0.05, bottom: 0.07 })
          } catch {
            // 邊距設定失敗不影響播放
          }

          await observeProperties(OBSERVED_PROPERTIES, ({ name, data }) => {
            if (name === 'pause') {
              setPlaying(data !== true)
            } else if (name === 'time-pos') {
              const t = typeof data === 'number' ? data : 0
              setTimePos(t)
              // time-pos 在推進 = 影片正在播，取消備援看門狗
              if (t > 0 && !seenRef) markVideoReady()
            } else if (name === 'duration') {
              setDuration(typeof data === 'number' ? data : 0)
            }
          })

          // 診斷：mpv 目前用的影像輸出裝置（video-vo，例如 wid / d3d11 / ...）
          // 讀取失敗也記錄下來（之前被 catch 吞掉，所以一直顯示「未知」）
          const readVideoVo = async (tag: string) => {
            let desc = 'n/a'
            try {
              const v = await getProperty('video-vo', 'string')
              desc = v == null ? 'null' : Array.isArray(v) ? v.join('|') : String(v)
              setVideoVo(desc || '（空值）')
            } catch (e: unknown) {
              const m = e instanceof Error ? e.message : String(e)
              desc = `讀取失敗: ${m}`.slice(0, 80)
              setVideoVo(desc)
            }
            setDiagLog((prev) => [...prev.slice(-40), `[diag] ${tag} video-vo => ${desc}`])
          }
          void readVideoVo('t0')
          setTimeout(() => { void readVideoVo('t3s') }, 3000)
          setTimeout(() => { void readVideoVo('t8s') }, 8000)

          const audioUrl = streamResult.audioUrl ?? null
          const subs = streamResult.subtitles

          // 事件監聽：audio/sub 掛載 + 出畫面偵測 + mpv log 收集。
          // 注意：不要 unlisten 整組監聽，video-reconfig 等後續事件仍要收。
          const unlisten = await listenEvents((event) => {
            if (event.event === 'video-reconfig') {
              // 畫面真正出來了 → 取消備援看門狗
              markVideoReady()
            } else if (event.event === 'log-message') {
              // 收集 mpv 內部訊息作診斷證據（只留與影片輸出/錯誤相關的）
              const txt = String(event.text ?? '')
              if (/vo|vid|wid|window|video|error|403|fail/i.test(txt)) {
                setDiagLog((prev) => [...prev.slice(-40), `[${event.level}] ${txt.slice(0, 160)}`])
              }
            } else if (event.event === 'file-loaded' && !fileLoadedDone) {
              fileLoadedDone = true
              void (async () => {
                // 音訊/字幕掛載失敗「不是」播放失敗：只記到診斷，不彈「播放失敗」遮罩。
                // 否則影片播完/無字幕時 sid 設不到，就會誤報「字幕/音訊掛載失敗」
                try {
                  if (audioUrl) {
                    await command('audio-add', [audioUrl, 'select'])
                  }
                } catch (audioErr: unknown) {
                  const m = audioErr instanceof Error ? audioErr.message : String(audioErr)
                  setDiagLog((prev) => [...prev.slice(-40), `[diag] audio-add 失敗: ${m}`.slice(0, 120)])
                }
                try {
                  for (const sub of subs) {
                    await command('sub-add', [sub.path])
                  }
                  if (subs.length > 0) {
                    await setProperty('sid', 1).catch(() => {
                      // sid 設不到（如無字幕軌）不影響播放，僅記錄
                      setDiagLog((prev) => [...prev.slice(-40), '[diag] sid 設定略過（無可選字幕）'])
                    })
                  }
                } catch (subErr: unknown) {
                  const m = subErr instanceof Error ? subErr.message : String(subErr)
                  setDiagLog((prev) => [...prev.slice(-40), `[diag] sub-add 失敗: ${m}`.slice(0, 120)])
                }
              })()
            } else if (event.event === 'end-file' && event.reason === 'error') {
              // 暫存錯誤（HLS chunk 403、斷流等）不再強切外部：
              // 影片沒起來才切，起來了只提示、讓 mpv 自己重試
              if (!seenRef) {
                void launchExternal()
              } else {
                setError('串流中斷，嘗試重新播放中...')
              }
            }
          })
          unlistenEvents = unlisten

          await command('loadfile', [streamResult.path, 'replace'])
          startFallbackWatchdog()
          startVideoPolling()
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
        if (videoCheckTimer !== null) window.clearTimeout(videoCheckTimer)
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
    <div className="min-h-screen bg-transparent flex flex-col">
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

      {/* 控制列：播放/暫停 + 進度 + 剩餘 + 音訊延遲 + 字幕 + 診斷（libmpv 裸核心，控制 UI 自建） */}
      {!internalFailed && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#18181b] border-b border-[#27272a]">
          <button
            onClick={() => { void togglePause() }}
            disabled={!timePos && !videoReady}
            className="w-8 h-8 rounded-full bg-[#a855f7] hover:bg-[#9333ea] disabled:opacity-40 text-white flex items-center justify-center transition-colors"
            aria-label={isPaused ? 'play' : 'pause'}
            title={isPaused ? '播放' : '暫停'}
          >
            {isPaused ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
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
          {/* 剩餘時間（直播常無總長，remaining 才有意義） */}
          <span className="text-xs tabular-nums text-[#a1a1aa] whitespace-nowrap">
            {t('remaining', language as any)} {fmtTime(remaining)}
          </span>
          {/* 音訊延遲：±100ms，畫面浮顯示 +Nms，4 秒無操作淡出 */}
          <div className="flex items-center gap-1" title={t('audioDelay', language as any)}>
            <button
              onClick={() => { adjustAudioDelay(-100) }}
              className="w-7 h-7 rounded bg-[#27272a] border border-[#3f3f46] text-white text-xs flex items-center justify-center hover:bg-[#3f3f46] transition-colors"
              aria-label="audio delay minus"
            >
              −
            </button>
            <button
              onClick={() => { adjustAudioDelay(100) }}
              className="w-7 h-7 rounded bg-[#27272a] border border-[#3f3f46] text-white text-xs flex items-center justify-center hover:bg-[#3f3f46] transition-colors"
              aria-label="audio delay plus"
            >
              +
            </button>
          </div>
          {/* 字幕 開/關 + 設定（大小/顏色/背景） */}
          <button
            onClick={toggleSub}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              subOn
                ? 'bg-[#a855f7] text-white'
                : 'bg-[#27272a] border border-[#3f3f46] text-[#a1a1aa] hover:bg-[#3f3f46]'
            }`}
            title={t('subSettings', language as any)}
          >
            {subOn ? t('subOn', language as any) : t('subOff', language as any)}
          </button>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-[#a1a1aa]">{t('subFont', language as any)}</label>
            <select
              value={subFont}
              onChange={(e) => applySubFont(e.target.value)}
              className="px-1.5 py-0.5 rounded bg-[#27272a] border border-[#3f3f46] text-white text-[11px] max-w-[110px]"
              aria-label="sub font"
            >
              <option value="Sans">Sans</option>
              <option value="Microsoft JhengHei">微軟正黑體</option>
              <option value="Microsoft YaHei">微軟雅黑</option>
              <option value="PMingLiU">新細明體</option>
              <option value="DengXian">等距線體</option>
              <option value="Arial">Arial</option>
              <option value="SimSun">宋體</option>
            </select>
            <label className="text-[11px] text-[#a1a1aa]">{t('subSize', language as any)}</label>
            <input
              type="number"
              min={8}
              max={72}
              value={subSize}
              onChange={(e) => applySubSize(parseInt(e.target.value, 10) || 18)}
              className="w-12 px-1.5 py-0.5 rounded bg-[#27272a] border border-[#3f3f46] text-white text-[11px]"
              aria-label="sub size"
            />
            <label className="text-[11px] text-[#a1a1aa]">{t('subColor', language as any)}</label>
            <input
              type="color"
              value={subColor}
              onChange={(e) => applySubColor(e.target.value)}
              className="w-6 h-6 p-0.5 rounded bg-[#27272a] border border-[#3f3f46] cursor-pointer"
              aria-label="sub color"
            />
            <label className="text-[11px] text-[#a1a1aa]">{t('subBackground', language as any)}</label>
            <input
              type="color"
              value={subBg}
              onChange={(e) => applySubBg(e.target.value)}
              className="w-6 h-6 p-0.5 rounded bg-[#27272a] border border-[#3f3f46] cursor-pointer"
              aria-label="sub background"
            />
          </div>
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

      {/* 音訊延遲浮動顯示（畫面中顯示目前 +Nms，按鍵後 4 秒淡出） */}
      {delayVisible && !internalFailed && (
        <div className="absolute top-14 right-6 z-30 px-3 py-1.5 rounded-lg bg-[#09090b]/85 backdrop-blur border border-[#27272a] text-sm text-[#fcd34d] font-mono transition-opacity">
          {t('audioDelay', language as any)} {audioDelay >= 0 ? '+' : ''}{audioDelay}ms
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

      <div className="flex-1 relative">
        {/* 影片就緒前：深色底（避免整頁全透明看穿到桌面）；就緒後移除，讓 mpv 從透明像素透出來 */}
        {!videoReady && !internalFailed && (
          <div className="absolute inset-0 bg-[#09090b]" />
        )}
        <div ref={videoRef} className="absolute inset-0 w-full h-full" />
        {loading && playing && !error && !internalFailed && !videoReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
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
