import type { Video } from '@/lib/types'
import { t } from '@/lib/i18n'

interface VideoCardProps {
  video: Video
  language: string
  onPlay: (video: Video) => void
  onOpenChannel?: (channelId: string | null | undefined) => void
}

export function VideoCard({ video, language, onPlay, onOpenChannel }: VideoCardProps) {
  const durationLabel = video.duration
    ? `${Math.floor(video.duration / 60)}:${String(video.duration % 60).padStart(2, '0')}`
    : t('durationUnknown', language as any)

  return (
    <div
      className="group relative bg-[#18181b] rounded-xl overflow-hidden border border-[#27272a] hover:border-[#a855f7]/50 transition-all duration-200 cursor-pointer"
      onClick={() => onPlay(video)}
    >
      <div className="relative aspect-video overflow-hidden bg-[#0a0a0a]">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {video.duration && (
          <div className="absolute bottom-1 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-medium text-white">
            {durationLabel}
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-8 h-8 rounded-full bg-[#a855f7] flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" d="M8 5v14l11-7z" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-[#e4e4e7] leading-tight line-clamp-2 mb-1">{video.title}</h3>
        <p className="text-[#a1a1aa] text-xs leading-tight line-clamp-1">{video.channel}</p>
      </div>
      {video.channelId && onOpenChannel ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenChannel(video.channelId)
          }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#18181b]/90 backdrop-blur flex items-center justify-center text-[#a1a1aa] hover:text-white transition-colors"
          title={t('openChannel', language as any)}
          aria-label={t('openChannel', language as any)}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
