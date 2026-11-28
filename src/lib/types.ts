export interface Video {
  id: string
  title: string
  thumbnail: string
  channel: string
  duration?: number | null
  viewCount?: number | null
  channelId?: string | null
  availability?: string | null
}

export interface Channel {
  channelId: string
  title: string
  followerCount?: number | null
  description?: string | null
  thumbnail?: string | null
  channelUrl?: string | null
}

export interface SubtitleTrack {
  language: string
  name: string
  path: string
}

export interface StreamResult {
  path: string
  audioUrl?: string | null
  userAgent?: string | null
  subtitles: SubtitleTrack[]
}

export interface PlayerInfo {
  player: string
  exe?: string | null
  ok: boolean
  title?: string | null
  isLive?: boolean | null
}

export interface AppSettings {
  language: AppLanguage
  mediaType: MediaType
  maxResolution: MaxResolution
  subtitleLanguage: SubtitleLanguage
  playerType: PlayerType
  externalPlayer: ExternalPlayer
  searchLimit: number
  channelLimit: number
}

export type AppLanguage = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'es'
export type MediaType = 'videos' | 'channels'
export type MaxResolution = 'auto' | '1080' | '720' | '480' | '360'
export type SubtitleLanguage = 'auto' | 'none' | 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'ko' | 'es' | 'de' | 'fr'
export type PlayerType = 'internal' | 'external'
export type ExternalPlayer = 'vlc' | 'mpv'

export interface SearchVideosInput {
  keyword: string
  maxResults?: number
}

export interface SearchChannelsInput {
  keyword: string
  maxResults?: number
}

export interface SearchVideosOutput {
  ok: boolean
  data: Video[]
  error?: string | null
}

export interface SearchChannelsOutput {
  ok: boolean
  data: Channel[]
  error?: string | null
}

export interface StreamUrlInput {
  videoId: string
  resolution: MaxResolution
  subtitleLang: SubtitleLanguage
  playerType: PlayerType
}

export type ViewId = 'home' | 'channel' | 'player' | 'settings'

export interface ViewState {
  id: ViewId
  channel?: Channel | null
  videoId?: string | null
  sourceListId?: string | null
}
