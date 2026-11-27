import { useCallback, useState } from 'react'
import { AppProvider, useApp } from '@/contexts/AppContext'
import Home from '@/pages/Home'
import ChannelVideos from '@/pages/ChannelVideos'
import VideoPlayer from '@/pages/VideoPlayer'
import SettingsPage from '@/pages/SettingsPage'

function Router() {
  const { view, setView, setSearchQuery, settings } = useApp()
  const [autoSwitching, setAutoSwitching] = useState(false)

  /** 自動輪播：切到下一支影片（留在播放器視圖，重掛 VideoPlayer 的 stream 流程） */
  const handlePlayNext = useCallback((nextVideoId: string) => {
    setAutoSwitching(true)
    setView({ id: 'player', videoId: nextVideoId })
  }, [setView])

  const handleBack = useCallback(() => {
    if (!view) return
    switch (view.id) {
      case 'channel':
      case 'player':
        // 返回首頁：清除搜尋框關鍵字，保留影片列表與耗時（問題 1、5）
        setSearchQuery('')
        setView({ id: 'home' })
        break
      case 'settings':
        // 從設定頁返回：保留搜尋列表與關鍵字（問題 2）
        setView({ id: 'home' })
        break
      default:
        break
    }
  }, [view, setView, setSearchQuery])

  switch (view?.id) {
    case 'channel':
      return (
        <ChannelVideos
          channel={view.channel!}
          language={settings.language}
          onVideoSelect={(video) => setView({ id: 'player', videoId: video.id })}
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
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  )
}
