export type LanguageKey = 'zh-Hant' | 'zh-Hans' | 'en' | 'ja' | 'es'

interface Translations {
  [key: string]: Record<LanguageKey, string>
}

export const translations: Translations = {
  appName: {
    'zh-Hant': 'NoadYT-Desktop',
    'zh-Hans': 'NoadYT-Desktop',
    'en': 'NoadYT-Desktop',
    'ja': 'NoadYT-Desktop',
    'es': 'NoadYT-Desktop',
  },

  // Common
  search: {
    'zh-Hant': '搜尋',
    'zh-Hans': '搜索',
    'en': 'Search',
    'ja': '検索',
    'es': 'Buscar',
  },
  searchPlaceholder: {
    'zh-Hant': '輸入關鍵字搜尋 YouTube...',
    'zh-Hans': '输入关键词搜索 YouTube...',
    'en': 'Enter keyword to search YouTube...',
    'ja': 'キーワードを入力して YouTube を検索...',
    'es': 'Ingrese palabra clave para buscar en YouTube...',
  },
  resultsFound: {
    'zh-Hant': '找到 {count} 個結果',
    'zh-Hans': '找到 {count} 個結果',
    'en': '{count} results found',
    'ja': '{count} 件の結果が見つかりました',
    'es': '{count} resultados encontrados',
  },
  noResults: {
    'zh-Hant': '沒有找到結果',
    'zh-Hans': '没有找到结果',
    'en': 'No results found',
    'ja': '結果が見つかりませんでした',
    'es': 'No se encontraron resultados',
  },
  error: {
    'zh-Hant': '錯誤',
    'zh-Hans': '错误',
    'en': 'Error',
    'ja': 'エラー',
    'es': 'Error',
  },
  close: {
    'zh-Hant': '關閉',
    'zh-Hans': '关闭',
    'en': 'Close',
    'ja': '閉じる',
    'es': 'Cerrar',
  },
  ok: {
    'zh-Hant': '確定',
    'zh-Hans': '确定',
    'en': 'OK',
    'ja': 'OK',
    'es': 'Aceptar',
  },

  // Home / Navigation
  videos: {
    'zh-Hant': '影片',
    'zh-Hans': '影片',
    'en': 'Videos',
    'ja': '動画',
    'es': 'Vídeos',
  },
  channels: {
    'zh-Hant': '頻道',
    'zh-Hans': '频道',
    'en': 'Channels',
    'ja': 'チャンネル',
    'es': 'Canales',
  },
  channelVideos: {
    'zh-Hant': '{channel} 的影片',
    'zh-Hans': '{channel} 的影片',
    'en': '{channel}\'s Videos',
    'ja': '{channel} の動画',
    'es': 'Vídeos de {channel}',
  },
  back: {
    'zh-Hant': '返回',
    'zh-Hans': '返回',
    'en': 'Back',
    'ja': '戻る',
    'es': 'Atrás',
  },

  // Video card
  durationUnknown: {
    'zh-Hant': '未知時長',
    'zh-Hans': '未知时长',
    'en': 'Unknown duration',
    'ja': '不明な長さ',
    'es': 'Duración desconocida',
  },
  play: {
    'zh-Hant': '播放',
    'zh-Hans': '播放',
    'en': 'Play',
    'ja': '再生',
    'es': 'Reproducir',
  },
  openChannel: {
    'zh-Hant': '進入頻道',
    'zh-Hans': '进入频道',
    'en': 'Open Channel',
    'ja': 'チャンネルを開く',
    'es': 'Abrir canal',
  },

  // Player
  playerInternal: {
    'zh-Hant': '內建播放器',
    'zh-Hans': '内置播放器',
    'en': 'Internal Player',
    'ja': '内部プレーヤー',
    'es': 'Reproductor interno',
  },
  playerExternal: {
    'zh-Hant': '外部播放器',
    'zh-Hans': '外部播放器',
    'en': 'External Player',
    'ja': '外部プレーヤー',
    'es': 'Reproductor externo',
  },
  loadingStream: {
    'zh-Hant': '載入串流中...',
    'zh-Hans': '加载串流中...',
    'en': 'Loading stream...',
    'ja': 'ストリームを読み込み中...',
    'es': 'Cargando transmisión...',
  },
  streamReady: {
    'zh-Hant': '串流準備就緒',
    'zh-Hans': '串流准备就绪',
    'en': 'Stream ready',
    'ja': 'ストリームの準備ができました',
    'es': 'Transmisión lista',
  },
  subtitles: {
    'zh-Hant': '字幕',
    'zh-Hans': '字幕',
    'en': 'Subtitles',
    'ja': '字幕',
    'es': 'Subtítulos',
  },
  noSubtitles: {
    'zh-Hant': '無可用字幕',
    'zh-Hans': '无可用字幕',
    'en': 'No subtitles available',
    'ja': '字幕はありません',
    'es': 'No hay subtítulos disponibles',
  },
  playFailed: {
    'zh-Hant': '播放失敗',
    'zh-Hans': '播放失败',
    'en': 'Playback failed',
    'ja': '再生に失敗しました',
    'es': 'Error de reproducción',
  },
  openInExternal: {
    'zh-Hant': '在外部播放器開啟',
    'zh-Hans': '在外部播放器打开',
    'en': 'Open in External Player',
    'ja': '外部プレーヤーで開く',
    'es': 'Abrir en reproductor externo',
  },

  // Settings
  settings: {
    'zh-Hant': '設定',
    'zh-Hans': '设置',
    'en': 'Settings',
    'ja': '設定',
    'es': 'Ajustes',
  },
  settingsDesc: {
    'zh-Hant': '調整搜尋、字幕、解析度與播放器選項',
    'zh-Hans': '调整搜索、字幕、分辨率与播放器选项',
    'en': 'Configure search, subtitles, resolution, and player options',
    'ja': '検索、字幕、解像度、プレーヤー設定を調整',
    'es': 'Configurar búsqueda, subtítulos, resolución y reproductor',
  },
  language: {
    'zh-Hant': '介面語言',
    'zh-Hans': '界面语言',
    'en': 'Interface Language',
    'ja': 'インターフェース言語',
    'es': 'Idioma de la interfaz',
  },
  languageDesc: {
    'zh-Hant': '選擇應用程式介面顯示語言',
    'zh-Hans': '选择应用程序界面显示语言',
    'en': 'Choose the application interface language',
    'ja': 'アプリケーションインターフェースの言語を選択',
    'es': 'Elija el idioma de la interfaz de la aplicación',
  },
  mediaType: {
    'zh-Hant': '搜索類型',
    'zh-Hans': '搜索类型',
    'en': 'Search Type',
    'ja': '検索タイプ',
    'es': 'Tipo de búsqueda',
  },
  mediaTypeDesc: {
    'zh-Hant': '切換搜尋影片或頻道',
    'zh-Hans': '切换搜索影片或频道',
    'en': 'Switch between searching videos or channels',
    'ja': '動画またはチャンネルの検索を切り替え',
    'es': 'Cambiar entre buscar videos o canales',
  },
  maxResolution: {
    'zh-Hant': '解析度上限',
    'zh-Hans': '分辨率上限',
    'en': 'Max Resolution',
    'ja': '最大解像度',
    'es': 'Resolución máxima',
  },
  maxResolutionDesc: {
    'zh-Hant': '限制影片串流的最高解析度',
    'zh-Hans': '限制视频流的最高分辨率',
    'en': 'Limit the maximum resolution of video streams',
    'ja': '動画ストリームの最大解像度を制限',
    'es': 'Limitar la resolución máxima de los flujos de video',
  },
  subtitleLanguage: {
    'zh-Hant': '字幕語言',
    'zh-Hans': '字幕语言',
    'en': 'Subtitle Language',
    'ja': '字幕言語',
    'es': 'Idioma de subtítulos',
  },
  subtitleLanguageDesc: {
    'zh-Hant': '選擇偏好的字幕語言',
    'zh-Hans': '选择偏好的字幕语言',
    'en': 'Choose preferred subtitle language',
    'ja': '優先する字幕言語を選択',
    'es': 'Elija el idioma de subtítulos preferido',
  },
  playerType: {
    'zh-Hant': '播放器選擇',
    'zh-Hans': '播放器选择',
    'en': 'Player Selection',
    'ja': 'プレーヤー選択',
    'es': 'Selección de reproductor',
  },
  playerTypeDesc: {
    'zh-Hant': '選擇內建播放器或外部播放器',
    'zh-Hans': '选择内置播放器或外部播放器',
    'en': 'Choose internal or external player',
    'ja': '内部プレーヤーまたは外部プレーヤーを選択',
    'es': 'Elija reproductor interno o externo',
  },
  externalPlayer: {
    'zh-Hant': '外部播放器類型',
    'zh-Hans': '外部播放器类型',
    'en': 'External Player Type',
    'ja': '外部プレーヤータイプ',
    'es': 'Tipo de reproductor externo',
  },
  externalPlayerDesc: {
    'zh-Hant': '選擇 VLC 或 MPV 外部播放器',
    'zh-Hans': '选择 VLC 或 MPV 外部播放器',
    'en': 'Choose VLC or MPV external player',
    'ja': 'VLC または MPV 外部プレーヤーを選択',
    'es': 'Elija reproductor externo VLC o MPV',
  },
  searchLimit: {
    'zh-Hant': '搜尋影片條目數',
    'zh-Hans': '搜索影片条目数',
    'en': 'Video Search Limit',
    'ja': '動画検索件数',
    'es': 'Límite de búsqueda de videos',
  },
  searchLimitDesc: {
    'zh-Hant': '每次搜尋顯示的影片數量（20 ~ 120）',
    'zh-Hans': '每次搜索显示的影片数量（20 ~ 120）',
    'en': 'Number of videos shown per search (20 ~ 120)',
    'ja': '1 回の検索で表示される動画数（20 ～ 120）',
    'es': 'Número de videos mostrados por búsqueda (20 ~ 120)',
  },
  channelLimit: {
    'zh-Hant': '搜尋頻道條目數',
    'zh-Hans': '搜索频道条目数',
    'en': 'Channel Search Limit',
    'ja': 'チャンネル検索件数',
    'es': 'Límite de búsqueda de canales',
  },
  channelLimitDesc: {
    'zh-Hant': '每次搜尋顯示的頻道數量（30 ~ 60）',
    'zh-Hans': '每次搜索显示的频道数量（30 ~ 60）',
    'en': 'Number of channels shown per search (30 ~ 60)',
    'ja': '1 回の検索で表示されるチャンネル数（30 ～ 60）',
    'es': 'Número de canales mostrados por búsqueda (30 ~ 60)',
  },
  clearSubtitleCache: {
    'zh-Hant': '清除字幕快取',
    'zh-Hans': '清除字幕缓存',
    'en': 'Clear Subtitle Cache',
    'ja': '字幕キャッシュをクリア',
    'es': 'Limpiar caché de subtítulos',
  },
  clearSubtitleCacheDesc: {
    'zh-Hant': '清除字幕目錄中的字幕快取檔案',
    'zh-Hans': '清除字幕目录中的字幕缓存文件',
    'en': 'Clear subtitle cache files in the subtitle directory',
    'ja': '字幕ディレクトリ内の字幕キャッシュファイルをクリア',
    'es': 'Limpiar archivos de caché de subtítulos en el directorio de subtítulos',
  },
  clearing: {
    'zh-Hant': '清除中...',
    'zh-Hans': '清除中...',
    'en': 'Clearing...',
    'ja': 'クリア中...',
    'es': 'Limpiando...',
  },
  cacheCleared: {
    'zh-Hant': '字幕快取已清除',
    'zh-Hans': '字幕缓存已清除',
    'en': 'Subtitle cache cleared',
    'ja': '字幕キャッシュがクリアされました',
    'es': 'Caché de subtítulos limpiada',
  },

  // Resolution labels
  resAuto: {
    'zh-Hant': '自動（最高品質）',
    'zh-Hans': '自动（最高质量）',
    'en': 'Auto (Best Quality)',
    'ja': '自動（最高品質）',
    'es': 'Auto (Mejor calidad)',
  },
  res1080: {
    'zh-Hant': '1080P',
    'zh-Hans': '1080P',
    'en': '1080P',
    'ja': '1080P',
    'es': '1080P',
  },
  res720: {
    'zh-Hant': '720P',
    'zh-Hans': '720P',
    'en': '720P',
    'ja': '720P',
    'es': '720P',
  },
  res480: {
    'zh-Hant': '480P',
    'zh-Hans': '480P',
    'en': '480P',
    'ja': '480P',
    'es': '480P',
  },
  res360: {
    'zh-Hant': '360P',
    'zh-Hans': '360P',
    'en': '360P',
    'ja': '360P',
    'es': '360P',
  },

  // Subtitle language labels
  subAuto: {
    'zh-Hant': '自動偵測',
    'zh-Hans': '自动检测',
    'en': 'Auto Detect',
    'ja': '自動検出',
    'es': 'Detección automática',
  },
  subZhHant: {
    'zh-Hant': '繁體中文',
    'zh-Hans': '繁体中文',
    'en': 'Traditional Chinese',
    'ja': '繁体中国語',
    'es': 'Chino tradicional',
  },
  subZhHans: {
    'zh-Hant': '簡體中文',
    'zh-Hans': '简体中文',
    'en': 'Simplified Chinese',
    'ja': '簡体中国語',
    'es': 'Chino simplificado',
  },
  subEn: {
    'zh-Hant': '英文',
    'zh-Hans': '英文',
    'en': 'English',
    'ja': '英語',
    'es': 'Inglés',
  },
  subJa: {
    'zh-Hant': '日文',
    'zh-Hans': '日文',
    'en': 'Japanese',
    'ja': '日本語',
    'es': 'Japonés',
  },
  subKo: {
    'zh-Hant': '韓文',
    'zh-Hans': '韩文',
    'en': 'Korean',
    'ja': '韓国語',
    'es': 'Coreano',
  },
  subEs: {
    'zh-Hant': '西班牙文',
    'zh-Hans': '西班牙文',
    'en': 'Spanish',
    'ja': 'スペイン語',
    'es': 'Español',
  },
  subDe: {
    'zh-Hant': '德文',
    'zh-Hans': '德文',
    'en': 'German',
    'ja': 'ドイツ語',
    'es': 'Alemán',
  },
  subFr: {
    'zh-Hant': '法文',
    'zh-Hans': '法文',
    'en': 'French',
    'ja': 'フランス語',
    'es': 'Francés',
  },

  // Interface language labels
  langZhHant: {
    'zh-Hant': '繁體中文',
    'zh-Hans': '繁体中文',
    'en': 'Traditional Chinese',
    'ja': '繁体中国語',
    'es': 'Chino tradicional',
  },
  langZhHans: {
    'zh-Hant': '簡體中文',
    'zh-Hans': '简体中文',
    'en': 'Simplified Chinese',
    'ja': '簡体中国語',
    'es': 'Chino simplificado',
  },
  langEn: {
    'zh-Hant': '英文',
    'zh-Hans': '英文',
    'en': 'English',
    'ja': '英語',
    'es': 'Inglés',
  },
  langJa: {
    'zh-Hant': '日文',
    'zh-Hans': '日文',
    'en': 'Japanese',
    'ja': '日本語',
    'es': 'Japonés',
  },
  langEs: {
    'zh-Hant': '西班牙文',
    'zh-Hans': '西班牙文',
    'en': 'Spanish',
    'ja': 'スペイン語',
    'es': 'Español',
  },

  // External player labels
  playerVLC: {
    'zh-Hant': 'VLC',
    'zh-Hans': 'VLC',
    'en': 'VLC',
    'ja': 'VLC',
    'es': 'VLC',
  },
  playerMPV: {
    'zh-Hant': 'MPV',
    'zh-Hans': 'MPV',
    'en': 'MPV',
    'ja': 'MPV',
    'es': 'MPV',
  },
}

export function t(key: string, lang: LanguageKey, params?: Record<string, string | number>): string {
  const template = translations[key]?.[lang] || translations[key]?.['en'] || key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_match, name) => {
    const value = params[name]
    return value !== undefined ? String(value) : `{${name}}`
  })
}

export const languageNames: Record<LanguageKey, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '簡體中文',
  'en': 'English',
  'ja': '日本語',
  'es': 'Español',
}
