import type { Channel } from '@/lib/types'
import { t } from '@/lib/i18n'

interface ChannelCardProps {
  channel: Channel
  language: string
  onSelect: (channel: Channel) => void
}

export function ChannelCard({ channel, language, onSelect }: ChannelCardProps) {
  const followerText = channel.followerCount != null
    ? `${channel.followerCount.toLocaleString()} 位訂閱者`
    : t('durationUnknown', language as any)

  return (
    <button
      onClick={() => onSelect(channel)}
      className="w-full group flex items-center gap-4 bg-[#18181b] rounded-xl border border-[#27272a] hover:border-[#a855f7]/50 transition-all duration-200 p-3"
    >
      <div className="relative flex-shrink-0">
        <img
          src={channel.thumbnail || 'https://via.placeholder.com/88?text=CH'}
          alt={channel.title}
          className="w-20 h-20 rounded-lg object-cover bg-[#0a0a0a]"
          loading="lazy"
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-7 h-7 rounded-full bg-[#a855f7] flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-white" fill="currentColor" d="M8 5v14l11-7z" />
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-[#e4e4e7] leading-tight line-clamp-2">{channel.title}</h3>
        <p className="text-[#a1a1aa] text-xs mt-0.5 leading-tight">{followerText}</p>
      </div>
      <svg className="w-4 h-4 text-[#78716c] group-hover:text-[#a855f7] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
