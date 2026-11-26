import { useCallback, useState } from 'react'
import type {
  AppLanguage,
  MaxResolution,
  SubtitleLanguage,
  ExternalPlayer,
} from '@/lib/types'
import { t } from '@/lib/i18n'
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

export default function SettingsPage({ language, onBack }: SettingsPageProps) {
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
    clearSubtitleCache,
  } = useApp()

  const [clearing, setClearing] = useState(false)

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
    if (!window.confirm(t('clearSubtitleCache', language as any))) return
    setClearing(true)
    try {
      await clearSubtitleCache()
      // 成功：显示绿色确认状态 2 秒后恢复
      setTimeout(() => setClearing(false), 2000)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      alert(`清除失敗：${message}`)
      setClearing(false)
    }
  }, [clearSubtitleCache, language])

  return (
    <div className="min-h-screen bg-[#09090b] text-[#e4e4e7] flex flex-col">
      <header className="border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur px-6 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[#a1a1aa] hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">{t('back', language as any)}</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-[#e4e4e7] mb-2">{t('settings', language as any)}</h1>
            <p className="text-[#a1a1aa] text-sm">{t('settingsDesc', language as any)}</p>
          </div>

          {/* 介面語言 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('language', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('languageDesc', language as any)}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {INTERFACE_LANGUAGE_OPTIONS.map((opt: { value: AppLanguage; labelKey: string }) => (
                <button
                  key={opt.value}
                  onClick={() => setLanguage(opt.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                    currentLang === opt.value
                      ? 'bg-[#a855f7] text-white'
                      : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                  }`}
                >
                  {getLanguageLabel(opt.value)}
                </button>
              ))}
            </div>
          </section>

          {/* 搜索類型 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('mediaType', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('mediaTypeDesc', language as any)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMediaType('videos')}
                className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                  mediaType === 'videos'
                    ? 'bg-[#a855f7] text-white'
                    : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                }`}
              >
                {t('videos', language as any)}
              </button>
              <button
                onClick={() => setMediaType('channels')}
                className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                  mediaType === 'channels'
                    ? 'bg-[#a855f7] text-white'
                    : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                }`}
              >
                {t('channels', language as any)}
              </button>
            </div>
          </section>

          {/* 解析度上限 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('maxResolution', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('maxResolutionDesc', language as any)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {RESOLUTION_OPTIONS.map((opt: { value: MaxResolution; labelKey: string }) => (
                <button
                  key={opt.value}
                  onClick={() => setMaxResolution(opt.value)}
                  className={`px-2 py-2 rounded text-sm font-medium transition-all ${
                    currentRes === opt.value
                      ? 'bg-[#a855f7] text-white'
                      : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                  }`}
                >
                  {t(opt.labelKey, language as any)}
                </button>
              ))}
            </div>
          </section>

          {/* 字幕語言 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('subtitleLanguage', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('subtitleLanguageDesc', language as any)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {SUBTITLE_LANGUAGE_OPTIONS.map((opt: { value: SubtitleLanguage; labelKey: string }) => (
                <button
                  key={opt.value}
                  onClick={() => setSubtitleLanguage(opt.value)}
                  className={`px-2 py-2 rounded text-sm font-medium transition-all ${
                    currentSubLang === opt.value
                      ? 'bg-[#a855f7] text-white'
                      : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                  }`}
                >
                  {t(opt.labelKey, language as any)}
                </button>
              ))}
            </div>
          </section>

          {/* 播放器選擇 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('playerType', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('playerTypeDesc', language as any)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPlayerType('internal')}
                className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                  currentPlayerType === 'internal'
                    ? 'bg-[#a855f7] text-white'
                    : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                }`}
              >
                {t('playerInternal', language as any)}
              </button>
              <button
                onClick={() => setPlayerType('external')}
                className={`flex-1 py-2 rounded text-sm font-medium transition-all ${
                  currentPlayerType === 'external'
                    ? 'bg-[#a855f7] text-white'
                    : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                }`}
              >
                {t('playerExternal', language as any)}
              </button>
            </div>
            {currentPlayerType === 'external' && (
              <div className="mt-4 pl-2">
                <div className="mb-2 text-[#a1a1aa] text-xs">{t('externalPlayerDesc', language as any)}</div>
                <div className="flex gap-2">
                  {EXTERNAL_PLAYER_OPTIONS.map((opt: { value: ExternalPlayer; labelKey: string }) => (
                    <button
                      key={opt.value}
                      onClick={() => setExternalPlayer(opt.value)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                        currentExtPlayer === opt.value
                          ? 'bg-[#a855f7] text-white'
                          : 'bg-[#27272a] border border-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'
                      }`}
                    >
                      {t(opt.labelKey, language as any)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 搜尋條目數 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('searchLimit', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('searchLimitDesc', language as any)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="20"
                max="120"
                value={searchLimit}
                onChange={(e) => {
                  const v = Math.max(20, Math.min(120, parseInt(e.target.value, 10) || 20))
                  setSearchLimit(v)
                }}
                className="w-20 px-3 py-2 rounded bg-[#27272a] border border-[#3f3f46] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#a855f7]"
              />
            </div>
          </section>

          {/* 頻道搜尋條目數 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('channelLimit', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('channelLimitDesc', language as any)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="30"
                max="60"
                value={channelLimit}
                onChange={(e) => {
                  const v = Math.max(30, Math.min(60, parseInt(e.target.value, 10) || 30))
                  setChannelLimit(v)
                }}
                className="w-20 px-3 py-2 rounded bg-[#27272a] border border-[#3f3f46] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#a855f7]"
              />
            </div>
          </section>

          {/* 清除字幕快取 */}
 <section className="bg-[#18181b] rounded-xl border border-[#27272a] p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-[#e4e4e7]">{t('clearSubtitleCache', language as any)}</h2>
                <p className="text-[#a1a1aa] text-xs">{t('clearSubtitleCacheDesc', language as any)}</p>
              </div>
            </div>
            <button
              onClick={clearCache}
              disabled={clearing}
              className={`w-full py-3 rounded-lg font-medium transition-all ${
                clearing
                  ? 'bg-green-600 border border-green-500 text-white'
                  : 'bg-[#18181b] border border-[#27272a] text-[#a1a1aa] hover:text-white hover:border-[#a855f7]/50'
              }`}
            >
              {clearing ? t('cacheCleared', language as any) : t('clearSubtitleCache', language as any)}
            </button>
          </section>
        </div>
      </main>
    </div>
  )
}

function getLanguageLabel(value: AppLanguage): string {
  const labels: Record<AppLanguage, string> = {
    'zh-Hant': '繁體中文',
    'zh-Hans': '簡體中文',
    'en': 'English',
    'ja': '日本語',
    'es': 'Español',
  }
  return labels[value]
}
