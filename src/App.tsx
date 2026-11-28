import { useCallback, useState, useEffect } from 'react'
import { AppProvider, useApp } from '@/contexts/AppContext'
import Home from '@/pages/Home'
import ChannelVideos from '@/pages/ChannelVideos'
import VideoPlayer from '@/pages/VideoPlayer'
import SettingsPage from '@/pages/SettingsPage'
import { exitApp } from '@/lib/api'
import { t } from '@/lib/i18n'

// 簡單的 Toast 組件
function ExitToast({ visible, message, onDismiss }: { visible: boolean; message: string; onDismiss: () => void }) {
  if (!visible) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-[#18181b] border border-[#a855f7]/50 rounded-xl px-6 py-3 shadow-2xl backdrop-blur-md flex items-center gap-3">
        <svg className="w-5 h-5 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-white text-sm">{message}</span>
        <button
          onClick={onDismiss}
          className="ml-2 px-3 py-1 text-xs text-[#a1a1aa] hover:text-white rounded bg-[#27272a] border border-[#3f3f46]"
        >
          取消
        </button>
      </div>
    </div>
  )
}

function Router() {
  const { 
    view, 
    setView, 
    setSearchQuery, 
    settings, 
    searchState, 
    lastChannel, 
    exitWarned,
    lastBackPress,
    setExitWarned,
    setLastBackPress,
  } = useApp()
  const [autoSwitching, setAutoSwitching] = useState(false)

  /** 自動輪播：切到下一支影片（留在播放器視圖，重掛 VideoPlayer 的 stream 流程） */
  const handlePlayNext = useCallback((nextVideoId: string) => {
    setAutoSwitching(true)
    setView({ id: 'player', videoId: nextVideoId })
  }, [setView])

  const handleBack = useCallback(() => {
    if (!view) return
    const now = Date.now()
    
    switch (view.id) {
      case 'player':
        // 返回上一級：根據 sourceListId 判斷回到 ChannelVideos 或 Home
        if (view.sourceListId?.startsWith('channel-') && lastChannel) {
          // 從頻道視頻列表進來的，回到 ChannelVideos
          setView({ id: 'channel', channel: lastChannel })
        } else {
          // 從首頁視頻搜索進來的，回到 Home
          setSearchQuery('')
          setView({ id: 'home' })
        }
        break
      case 'channel':
        // 返回頻道列表（Home，保留頻道搜索結果）
        setView({ id: 'home' })
        break
      case 'home':
        // 在首頁時：如果是頻道模式且有頻道搜索結果，雙擊退出
        if (settings.mediaType === 'channels' && searchState.resultMediaType === 'channels' && searchState.results.length > 0) {
          if (now - lastBackPress < 2000 && exitWarned) {
            // 2秒內第二次按下 → 真正退出
            void exitApp()
          } else {
            // 首次按下 → 顯示提示
            setExitWarned(true)
            setLastBackPress(now)
            // 2秒後自動重置
            setTimeout(() => setExitWarned(false), 2000)
            // 這裡可以顯示一個 toast 提示，暫時用 console.log
            console.log('[Back] 再按一次返回鍵將退出應用')
          }
        }
        break
      case 'settings':
        // 從設定頁返回：保留搜尋列表與關鍵字
        setView({ id: 'home' })
        break
      default:
        break
    }
  }, [
    view, 
    setView, 
    setSearchQuery, 
    settings.mediaType, 
    searchState.resultMediaType, 
    searchState.results.length,
    lastChannel,
    exitWarned,
    lastBackPress,
    setExitWarned,
    setLastBackPress,
  ])

  // 全域鍵盤/手勢返回監聽：處理 Home(頻道列表) 的雙擊退出
  // 只有在 view === 'home' 且 mediaType === 'channels' 且有搜索結果時才攔截
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 攔截 Backspace、Escape、瀏覽器返回鍵
      const isBackKey = e.key === 'Backspace' || e.key === 'Escape' || e.key === 'BrowserBack'
      if (!isBackKey) return
      
      if (view?.id === 'home' && settings.mediaType === 'channels' && searchState.resultMediaType === 'channels' && searchState.results.length > 0) {
        e.preventDefault()
        handleBack()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, settings.mediaType, searchState.resultMediaType, searchState.results.length, handleBack])

  const dismissExitToast = useCallback(() => {
    setExitWarned(false)
  }, [setExitWarned])

  const currentView = (
    <>
      {(() => {
        switch (view?.id) {
          case 'channel':
            return (
              <ChannelVideos
                channel={view.channel!}
                language={settings.language}
                onVideoSelect={(video) => setView({ 
                  id: 'player', 
                  videoId: video.id,
                  sourceListId: `channel-${view.channel?.channelId}`,
                })}
                onBack={handleBack}
              />
            )
          case 'player':
            return (
              <VideoPlayer
                key={view.videoId}
                videoId={view.videoId!}
                language={settings.language}
                onBack={handleBack}
                onPlayNext={handlePlayNext}
                autoSwitching={autoSwitching}
                setAutoSwitching={setAutoSwitching}
              />
            )
          case 'settings':
            return (
              <SettingsPage language={settings.language} onBack={handleBack} />
            )
          default:
            return <Home />
        }
      })()}
      <ExitToast
        visible={exitWarned && view?.id === 'home' && settings.mediaType === 'channels' && searchState.resultMediaType === 'channels' && searchState.results.length > 0}
        message={t('pressBackAgainToExit', settings.language as any) || '再按一次返回鍵將退出應用'}
        onDismiss={dismissExitToast}
      />
    </>
  )

  return currentView
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  )
}
