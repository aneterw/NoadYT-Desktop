import { useCallback } from 'react'
import { AppProvider, useApp } from '@/contexts/AppContext'
import Home from '@/pages/Home'
import ChannelVideos from '@/pages/ChannelVideos'
import VideoPlayer from '@/pages/VideoPlayer'
import SettingsPage from '@/pages/SettingsPage'

function Router() {
  const { view, setView, setSearchStartTime } = useApp()
  const { language } = useApp().settings

  const handleBack = useCallback(() => {
    if (!view) return
    switch (view.id) {
      case 'channel':
        // 从频道页返回：清除搜索状态，回到首页初始状态
        setSearchStartTime(null)
        setView({ id: 'home' })
        break
      case 'player':
        // 从播放器返回：保留搜索结果，只重置搜索时间和查询框
        setSearchStartTime(null)
        setView(view.channel ? { id: 'channel', channel: view.channel } : { id: 'home' })
        break
      case 'settings':
        setView({ id: 'home' })
        break
      default:
        break
    }
  }, [view, setView, setSearchStartTime])

  switch (view?.id) {
    case 'home':
      return <Home />
    case 'channel':
      return (
        <ChannelVideos
          channel={view.channel!}
          language={language}
          onVideoSelect={(video) => setView({ id: 'player', videoId: video.id })}
          onBack={handleBack}
        />
      )
    case 'player':
      return (
        <VideoPlayer
          videoId={view.videoId!}
          language={language}
          onBack={handleBack}
        />
      )
    case 'settings':
      return (
        <SettingsPage language={language} onBack={handleBack} />
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
