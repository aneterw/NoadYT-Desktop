import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type {
  AppLanguage,
  MaxResolution,
  SubtitleLanguage,
  ExternalPlayer,
} from '@/lib/types'
import { t } from '@/lib/i18n'
import { openUrl, checkEnvironment, installPythonDeps, type EnvironmentCheck } from '@/lib/api'
import {
  useApp,
  RESOLUTION_OPTIONS,
  SUBTITLE_LANGUAGE_OPTIONS,
  INTERFACE_LANGUAGE_OPTIONS,
  EXTERNAL_PLAYER_OPTIONS,
} from '@/contexts/AppContext'

interface SettingsPageProps {
  language: string
  onBack: () => void
}

const SEARCH_LIMIT_RANGE = { min: 20, max: 120, step: 5 }
const CHANNEL_LIMIT_RANGE = { min: 30, max: 60, step: 5 }

/** 範圍滑桿：滑塊拖動 + 左右按鈕 + 聚焦後方向鍵微調 */
function RangeSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  lang,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  lang: 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'es'
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#a1a1aa]">{label}</span>
        <span className="text-lg font-bold text-[#a855f7] tabular-nums">{value}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="decrease"
          onClick={() => onChange(clamp(value - step))}
          disabled={value <= min}
          className="w-7 h-7 rounded bg-[#27272a] border border-[#3f3f46] text-white text-sm flex items-center justify-center hover:bg-[#3f3f46] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          aria-label={label}
          className="flex-1 accent-[#a855f7] cursor-pointer h-2"
        />
        <button
          type="button"
          aria-label="increase"
          onClick={() => onChange(clamp(value + step))}
          disabled={value >= max}
          className="w-7 h-7 rounded bg-[#27272a] border border-[#3f3f46] text-white text-sm flex items-center justify-center hover:bg-[#3f3f46] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          +
        </button>
      </div>
      <p className="text-[11px] text-[#71717a]">
        {t('sliderHint', lang)} · 範圍 {min} ~ {max}（每次 {step}）
      </p>
    </div>
  )
}

export default function SettingsPage({ language, onBack }: SettingsPageProps) {
  const langKey = language as 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'es'
  const {
    settings,
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
  } = useApp()

  const [clearing, setClearing] = useState(false)
  const [playerPaths, setPlayerPaths] = useState<{ vlc: string | null; mpv: string | null } | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savedToast, setSavedToast] = useState(false)
  const [env, setEnv] = useState<EnvironmentCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [installingDeps, setInstallingDeps] = useState(false)
  const [installMsg, setInstallMsg] = useState('')

  // 環境檢查快取：使用 localStorage 跨頁面持久化完整檢查結果
  // 結構：{ checked: boolean, data: EnvironmentCheck }
  const ENV_CACHE_KEY = 'noadyt-env-cache'
  type EnvCache = { checked: boolean; data: EnvironmentCheck | null }
  const loadEnvCache = (): EnvCache | null => {
    try {
      const raw = localStorage.getItem(ENV_CACHE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as EnvCache
      return parsed && typeof parsed.checked === 'boolean' ? parsed : null
    } catch {
      return null
    }
  }
  const saveEnvCache = (data: EnvironmentCheck | null): void => {
    try {
      localStorage.setItem(ENV_CACHE_KEY, JSON.stringify({ checked: true, data }))
    } catch {
      // ignore
    }
  }
  const clearEnvCache = (): void => {
    try {
      localStorage.removeItem(ENV_CACHE_KEY)
    } catch {
      // ignore
    }
  }

  // 環境檢查（Python / 必要套件 / ffmpeg / 播放器）
  const refreshEnv = useCallback(async () => {
    setChecking(true)
    try {
      const result = await checkEnvironment()
      setEnv(result)
      setPlayerPaths({ vlc: result.vlc ?? null, mpv: result.mpv ?? null })
      saveEnvCache(result)
    } catch {
      setEnv(null)
      setPlayerPaths({ vlc: null, mpv: null })
      saveEnvCache(null)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    // 進入設定頁時先嘗試從快取讀取，避免每次都重複檢查
    const cached = loadEnvCache()
    if (cached) {
      setEnv(cached.data)
      setPlayerPaths({ vlc: cached.data?.vlc ?? null, mpv: cached.data?.mpv ?? null })
    } else {
      void refreshEnv()
    }
  }, [refreshEnv])

  /** 一鍵安裝缺的 Python 套件 */
  const handleInstallDeps = useCallback(async () => {
    setInstallingDeps(true)
    setInstallMsg('')
    try {
      const result = await installPythonDeps()
      setInstallMsg(`✅ ${result}`)
      await refreshEnv()
    } catch (err: unknown) {
      setInstallMsg(`❌ ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstallingDeps(false)
    }
  }, [refreshEnv])

  const {
    language: currentLang,
    mediaType,
    maxResolution: currentRes,
    subtitleLanguage: currentSubLang,
    playerType: currentPlayerType,
    externalPlayer: currentExtPlayer,
    searchLimit,
    channelLimit,
  } = settings

  const clearCache = useCallback(async () => {
    if (!window.confirm(t('clearSubtitleCache', langKey))) return
    setClearing(true)
    try {
      await clearSubtitleCache()
      setTimeout(() => setClearing(false), 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      alert(`${t('error', langKey)}：${message}`)
      setClearing(false)
    }
  }, [clearSubtitleCache, langKey])

  /** 儲存並離開：列出所有參數現況，確認後回主頁 */
  const handleSaveAndExit = () => {
    setShowSaveDialog(true)
  }

  const confirmSaveAndExit = () => {
    saveCurrentSettings()
    setShowSaveDialog(false)
    setSavedToast(true)
    setTimeout(() => {
      setSavedToast(false)
      onBack()
    }, 800)
  }

  const resLabel = RESOLUTION_OPTIONS.find((o) => o.value === currentRes)?.labelKey ?? 'resAuto'
  const subLabel = SUBTITLE_LANGUAGE_OPTIONS.find((o) => o.value === currentSubLang)?.labelKey ?? 'subAuto'
  const playerLabel =
    currentPlayerType === 'external'
      ? `${t('playerExternal', langKey)}（${t(EXTERNAL_PLAYER_OPTIONS.find((o) => o.value === currentExtPlayer)?.labelKey ?? 'playerVLC', langKey)}）`
      : t('playerInternal', langKey)

  const summaryRows: { label: string; value: string }[] = [
    { label: t('language', langKey), value: getLanguageLabel(currentLang) },
    { label: t('mediaType', langKey), value: t(mediaType === 'videos' ? 'videos' : 'channels', langKey) },
    { label: t('maxResolution', langKey), value: t(resLabel, langKey) },
    { label: t('subtitleLanguage', langKey), value: t(subLabel, langKey) },
    { label: t('playerType', langKey), value: playerLabel },
    { label: t('searchLimit', langKey), value: String(searchLimit) },
    { label: t('channelLimit', langKey), value: String(channelLimit) },
  ]

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] flex flex-col relative">
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur px-6 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">{t('back', langKey)}</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-[#e4e4e7] mb-2">{t('settings', langKey)}</h1>
            <p className="text-[#a1a1aa] text-sm">{t('settingsDesc', langKey)}</p>
          </div>

          {/* 環境狀態：Python / 必要套件 / ffmpeg / 播放器 */}
          <Section title={t('envStatus', langKey)} desc={t('envDesc', langKey)}>
            {/* 檢查工具列：重新檢查按鈕 */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => { clearEnvCache(); void refreshEnv() }}
                disabled={checking}
                className="px-3 py-1.5 rounded text-xs font-medium bg-[#27272a] border border-[#3f3f46] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50 disabled:opacity-50 transition-colors"
                title="重新檢查所有環境條件"
              >
                {checking ? '檢查中...' : '重新檢查環境'}
              </button>
              {env === null ? (
                <span className="text-[11px] text-[#a1a1aa]">尚未檢查</span>
              ) : (
                <span className="text-[11px] text-[#a1a1aa]">上次檢查：已完成</span>
              )}
            </div>
            {env === null ? (
              <div className="text-xs text-[#a1a1aa]">
                {checking ? t('envChecking', langKey) : '環境已檢查（點上方按鈕可重新檢測）'}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* 總體狀態 */}
                {env.pythonOk && env.ffmpegOk && env.packages.every((p) => p.ok) && (
                  <div className="px-3 py-2 rounded-lg border border-[#166534]/50 bg-[#166534]/15 text-[#4ade80] font-medium">
                    ✅ {t('envAllOk', langKey)}
                  </div>
                )}

                {/* Python */}
                <div className="px-3 py-2 rounded-lg border border-[#27272a] bg-[#09090b]">
                  {env.pythonOk ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[#4ade80] shrink-0">{t('envDetected', langKey)}</span>
                      <span className="text-[#a1a1aa]">{env.pythonVersion}</span>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[#f87171] font-medium">{t('envPython', langKey)} {t('envNotDetected', langKey)}</span>
                      </div>
                      <p className="mt-1.5 text-[#fbbf24] leading-relaxed">{t('envPythonHint', langKey)}</p>
                      <button
                        onClick={() => { void openUrl('https://www.python.org/downloads/') }}
                        className="mt-2 px-3 py-1.5 rounded text-xs font-medium bg-[#27272a] border border-[#f59e0b]/40 text-[#fbbf24] hover:bg-[#3f3f46] transition-colors"
                      >
                        {t('envPythonSite', langKey)} ↗
                      </button>
                    </div>
                  )}
                  <EnvDot ok={env.pythonOk} />
                </div>

                {/* 必要套件 */}
                <div className="px-3 py-2 rounded-lg border border-[#27272a] bg-[#09090b]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#e4e4e7] font-medium flex-1">{t('envPackages', langKey)}</span>
                    {env.packages.length > 0 && (
                      <span className="text-[#a1a1aa]">
                        {env.packages.filter((p) => p.ok).length}/{env.packages.length}
                      </span>
                    )}
                    <EnvDot ok={env.packages.every((p) => p.ok)} />
                  </div>
                  {env.packages.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {env.packages.map((p) => (
                        <div key={p.name} className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.ok ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`} />
                          <span className={p.ok ? 'text-[#a1a1aa]' : 'text-[#f87171]'}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {env.pythonOk && !env.packages.every((p) => p.ok) && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[#fbbf24]">
                        {t('envMissingPkgHint', langKey)}{' '}
                        {env.packages.filter((p) => !p.ok).map((p) => p.name).join('、')}
                      </p>
                      <button
                        onClick={() => { void handleInstallDeps() }}
                        disabled={installingDeps}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-[#a855f7] hover:bg-[#9333ea] text-white disabled:opacity-50 transition-colors"
                      >
                        {installingDeps ? t('envInstalling', langKey) : t('envInstallDeps', langKey)}
                      </button>
                      {installMsg && (
                        <p className={`text-[11px] leading-relaxed ${installMsg.startsWith('✅') ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                          {installMsg}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ffmpeg */}
                <div className="px-3 py-2 rounded-lg border border-[#27272a] bg-[#09090b] flex items-center gap-2">
                  <span className="text-[#e4e4e7] font-medium flex-1">{t('envFfmpeg', langKey)}</span>
                  <span className={env.ffmpegOk ? 'text-[#4ade80]' : 'text-[#f87171]'}>
                    {env.ffmpegOk ? t('envDetected', langKey) : t('envNotDetected', langKey)}
                  </span>
                  <EnvDot ok={env.ffmpegOk} />
                </div>

                {/* 播放器 */}
                <div className="px-3 py-2 rounded-lg border border-[#27272a] bg-[#09090b] space-y-1.5">
                  <div className="text-[#e4e4e7] font-medium">{t('externalPlayer', langKey)}</div>
                  {(['mpv', 'vlc'] as const).map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="font-mono text-[#a1a1aa] w-10 shrink-0">{name.toUpperCase()}</span>
                      <span className={env[name] ? 'text-[#4ade80]' : 'text-[#f87171]'}>
                        {env[name] ? t('envDetected', langKey) : t('envNotDetected', langKey)}
                      </span>
                      <EnvDot ok={!!env[name]} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* 介面語言 */}
          <Section title={t('language', langKey)} desc={t('languageDesc', langKey)}>
            <div className="flex gap-2 flex-wrap">
              {INTERFACE_LANGUAGE_OPTIONS.map((opt: { value: AppLanguage; labelKey: string }) => (
                <LangPill
                  key={opt.value}
                  active={currentLang === opt.value}
                  label={getLanguageLabel(opt.value)}
                  onClick={() => setLanguage(opt.value)}
                />
              ))}
            </div>
          </Section>

          {/* 搜索類型 */}
          <Section title={t('mediaType', langKey)} desc={t('mediaTypeDesc', langKey)}>
            <div className="flex gap-2">
              <Pill active={mediaType === 'videos'} label={t('videos', langKey)} onClick={() => setMediaType('videos')} />
              <Pill active={mediaType === 'channels'} label={t('channels', langKey)} onClick={() => setMediaType('channels')} />
            </div>
          </Section>

          {/* 解析度上限 */}
          <Section title={t('maxResolution', langKey)} desc={t('maxResolutionDesc', langKey)}>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {RESOLUTION_OPTIONS.map((opt: { value: MaxResolution; labelKey: string }) => (
                <Pill
                  key={opt.value}
                  active={currentRes === opt.value}
                  label={t(opt.labelKey, langKey)}
                  onClick={() => setMaxResolution(opt.value)}
                />
              ))}
            </div>
          </Section>

          {/* 字幕語言 */}
          <Section title={t('subtitleLanguage', langKey)} desc={t('subtitleLanguageDesc', langKey)}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {SUBTITLE_LANGUAGE_OPTIONS.map((opt: { value: SubtitleLanguage; labelKey: string }) => (
                <Pill
                  key={opt.value}
                  active={currentSubLang === opt.value}
                  label={t(opt.labelKey, langKey)}
                  onClick={() => setSubtitleLanguage(opt.value)}
                />
              ))}
            </div>
          </Section>

          {/* 播放器選擇 */}
          <Section title={t('playerType', langKey)} desc={t('playerTypeDesc', langKey)}>
            <div className="flex gap-2">
              <Pill
                active={currentPlayerType === 'internal'}
                label={t('playerInternal', langKey)}
                onClick={() => setPlayerType('internal')}
              />
              <Pill
                active={currentPlayerType === 'external'}
                label={t('playerExternal', langKey)}
                onClick={() => setPlayerType('external')}
              />
            </div>
            {currentPlayerType === 'external' && (
              <div className="mt-4 pl-2 space-y-3">
                <div className="text-[#a1a1aa] text-xs">{t('externalPlayerDesc', langKey)}</div>
                <div className="flex gap-2">
                  {EXTERNAL_PLAYER_OPTIONS.map((opt: { value: ExternalPlayer; labelKey: string }) => (
                    <Pill
                      key={opt.value}
                      active={currentExtPlayer === opt.value}
                      label={t(opt.labelKey, langKey)}
                      onClick={() => setExternalPlayer(opt.value)}
                    />
                  ))}
                </div>
                {/* 偵測到的主程式路徑 */}
                {playerPaths && (
                  <div className="space-y-1 text-xs">
                    {(['vlc', 'mpv'] as const).map((name) => {
                      const path = playerPaths[name]
                      const active = currentExtPlayer === name
                      return (
                        <div
                          key={name}
                          className={`px-3 py-2 rounded border flex items-center gap-2 ${
                            active ? 'border-[#a855f7]/50 bg-[#a855f7]/10' : 'border-[#27272a] bg-[#18181b]'
                          }`}
                        >
                          <span className="font-semibold w-8 shrink-0">{name.toUpperCase()}</span>
                          {path ? (
                            <>
                              <span className="text-[#4ade80]">{t('playerDetected', langKey)}:</span>
                              <span className="text-[#a1a1aa] break-all" title={path}>{path}</span>
                            </>
                          ) : (
                            <span className="text-[#f87171]">{t('playerNotFound', langKey)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* MPV 未偵測到：直播必須用 MPV，給官網下載按鈕 */}
                {playerPaths && !playerPaths.mpv && (
                  <div className="px-3 py-3 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 space-y-2">
                    <p className="text-xs text-[#fbbf24] flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.545 0 2.807-1.262 2.807-2.81V5.808c0-1.549-1.262-2.81-2.807-2.81H4.938C3.393 3 2.131 4.262 2.131 5.81v10.384C2.131 17.738 3.393 19 4.938 19z" />
                      </svg>
                      {t('mpvRequiredHint', langKey)}
                    </p>
                    <button
                      onClick={() => { void openUrl('https://mpv.io/installation/') }}
                      className="px-3 py-1.5 rounded text-xs font-medium bg-[#27272a] border border-[#f59e0b]/40 text-[#fbbf24] hover:bg-[#3f3f46] transition-colors"
                    >
                      {t('goToMpvSite', langKey)} ↗
                    </button>
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* 搜尋條目數（滑桿） */}
          <Section title={t('searchLimit', langKey)} desc={t('searchLimitDesc', langKey)}>
            <RangeSlider
              label={t('searchLimit', langKey)}
              value={searchLimit}
              min={SEARCH_LIMIT_RANGE.min}
              max={SEARCH_LIMIT_RANGE.max}
              step={SEARCH_LIMIT_RANGE.step}
              onChange={setSearchLimit}
              lang={langKey}
            />
          </Section>

          {/* 頻道搜尋條目數（滑桿） */}
          <Section title={t('channelLimit', langKey)} desc={t('channelLimitDesc', langKey)}>
            <RangeSlider
              label={t('channelLimit', langKey)}
              value={channelLimit}
              min={CHANNEL_LIMIT_RANGE.min}
              max={CHANNEL_LIMIT_RANGE.max}
              step={CHANNEL_LIMIT_RANGE.step}
              onChange={setChannelLimit}
              lang={langKey}
            />
          </Section>

          {/* 清除字幕快取 */}
          <Section title={t('clearSubtitleCache', langKey)} desc={t('clearSubtitleCacheDesc', langKey)}>
            <button
              onClick={clearCache}
              disabled={clearing}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                clearing
                  ? 'bg-green-600 border border-green-500 text-white'
                  : 'bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50'
              }`}
            >
              {clearing ? t('cacheCleared', langKey) : t('clearSubtitleCache', langKey)}
            </button>
          </Section>

          {/* 儲存並離開 */}
          <div className="pt-4 border-t border-[#27272a]">
            <button
              onClick={handleSaveAndExit}
              className="w-full py-3 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] text-white font-semibold transition-colors"
            >
              {t('saveAndExit', langKey)}
            </button>
          </div>
        </div>
      </main>

      {/* 儲存並離開對話框：列出所有參數現況 */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-[#18181b] border border-[#3f3f46] rounded-xl shadow-2xl">
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-lg font-bold text-[#e4e4e7]">{t('saveAndExitTitle', langKey)}</h3>
              <p className="text-xs text-[#a1a1aa] mt-1">{t('saveAndExitDesc', langKey)}</p>
            </div>
            <div className="px-5 py-3 border-t border-[#27272a] space-y-2">
              {summaryRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-[#a1a1aa] shrink-0">{row.label}</span>
                  <span className="text-[#e4e4e7] font-medium text-right break-all">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-[#27272a] flex gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2.5 rounded-lg bg-[#27272a] border border-[#3f3f46] text-[#a1a1aa] hover:text-white text-sm font-medium transition-colors"
              >
                {t('cancel', langKey)}
              </button>
              <button
                onClick={confirmSaveAndExit}
                className="flex-1 py-2.5 rounded-lg bg-[#a855f7] hover:bg-[#9333ea] text-white text-sm font-semibold transition-colors"
              >
                {t('confirm', langKey)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 儲存成功提示 */}
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-[#166534] border border-green-500 text-white text-sm shadow-xl">
          {t('savedToast', langKey)}
        </div>
      )}
    </div>
  )
}

/* ---------- 小型 UI 元件 ---------- */

function EnvDot({ ok }: { ok: boolean }) {
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? 'bg-[#4ade80]' : 'bg-[#f87171]'}`} />
  )
}

function Section({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
      <div className="mb-3">
        <h2 className="font-semibold text-[#e4e4e7]">{title}</h2>
        <p className="text-[#a1a1aa] text-xs">{desc}</p>
      </div>
      {children}
    </section>
  )
}

function Pill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-all ${
        active
          ? 'bg-[#a855f7] text-white'
          : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
      }`}
    >
      {label}
    </button>
  )
}

function LangPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
        active
          ? 'bg-[#a855f7] text-white'
          : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
      }`}
    >
      {label}
    </button>
  )
}

function getLanguageLabel(value: AppLanguage): string {
  const labels: Record<AppLanguage, string> = {
    'zh-Hant': '繁體中文',
    'zh-Hans': '簡體中文',
    en: 'English',
    ja: '日本語',
    es: 'Español',
  }
  return labels[value]
}
