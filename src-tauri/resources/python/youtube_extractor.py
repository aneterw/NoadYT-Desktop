# NoadYTTV - Python Integration Module
# This module provides the bridge between Kotlin and yt-dlp via Chaquopy

import yt_dlp
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Dict, List, Optional, Any
from urllib.parse import urlunparse
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable,
)
from youtube_transcript_api.formatters import WebVTTFormatter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════
# Global Settings (run19.py) - 可在此切換播放器與影片設定
# ═══════════════════════════════════════════════════════════════════
PREFERRED_PLAYER = 'mpv'       # 'mpv' or 'vlc'
MAX_RESOLUTION = 'auto'        # 'auto' or 1080, 720, 480, 360
AUTO_USE_MPV_FOR_LIVE = True   # Force MPV for LIVE streams
LIVE_PREFER_30FPS = True       # Prefer 30fps for LIVE streams
LIVE_AUDIO_DELAY = 0.0         # Audio delay in seconds for LIVE streams
VIDEO_ID = 'OTOwdx4Be7M'       # Video ID or URL
PREFERRED_LANGUAGES = ['zh-TW', 'zh-Hant', 'zh-Hans', 'zh', 'en', 'ja', 'ko', 'es', 'de', 'fr']
# ═══════════════════════════════════════════════════════════════════

class YouTubeExtractor:
    """Wrapper for yt-dlp to extract YouTube video info and streams"""

    def __init__(self):
        # 關鍵修正：不指定 player_client，讓 yt-dlp 使用默認行為
        # android / android_tv_embedded 在不同環境下可能被 YouTube 封鎖，導致 extract_info 返回空結果
        # 參考 run5.py：啟用 Node.js runtime + 自動下載最新 YouTube 解密組件，解決 "n challenge solving failed"
        self.base_opts = {
            # 1. 核心安全解密組態：啟用 Node.js 並允許從 GitHub 下載最新 YouTube 解密組件
            'js_runtimes': {'node': {}},
            'remote_components': 'ejs:github',

            # 不設定 ignoreerrors / ignore_no_formats_error，讓 yt-dlp 的實際錯誤暴露出來
            # 方便診斷 extract_info 為何返回空結果

            'quiet': True,          # 抑制 yt-dlp 日誌到 stdout，確保 stdout 只有純 JSON
            'no_warnings': True,
            'extract_flat': False,
            'skip_download': True,

            # 字幕設定：不啟用自動下載（由 play_video 獨立處理）
            'writesubtitles': False,
            'writeautomaticsub': False,
            # 'subtitleslangs': ['zh-Hant', 'en', 'ja-orig', 'ja', 'zh-Hans', 'ko'],
        }

        # 🎯 一般影片 (VOD)：優先 1080p+ DASH (獨立影片+音訊)
        # 不設定 format 選項，讓 yt-dlp 返回所有格式，再由 _filter_formats 篩選
        self.vod_opts = self.base_opts.copy()

        # 🎯 直播影片 (Live)：使用 HLS/m3u8 串流，優先 1080p
        self.live_opts = self.base_opts.copy()
        self.live_opts.update({
            'live_from_start': False,
            'wait_for_video': (1, 30),
        })

    def _get_opts(self, is_live: bool) -> Dict:
        """根據是否為直播返回對應的選項"""
        return self.live_opts if is_live else self.vod_opts

    def search(self, query: str, max_results: int = 60) -> List[Dict[str, Any]]:
        """Search YouTube videos - returns up to 60 results"""
        search_opts = {
            'playlistend': max_results,
            'timeout': 15,
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,         # 快速模式：只抓基本資訊
        }

        try:
            with yt_dlp.YoutubeDL(search_opts) as ydl:
                result = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)

                if result and 'entries' in result:
                    videos = []
                    for entry in result['entries']:
                        if entry and isinstance(entry, dict):
                            videos.append({
                                'id': entry.get('id', ''),
                                'title': entry.get('title', '無標題'),
                                'duration': entry.get('duration'),
                                'thumbnail': self._get_thumbnail(entry),
                                'channel': entry.get('uploader', '未知頻道'),
                                'channel_id': entry.get('channel_id', ''),
                                'view_count': entry.get('view_count'),
                                'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                            })
                    return videos
        except Exception as e:
            logger.error(f"Search error: {e}")

        return []

    def _get_thumbnail(self, entry: Dict) -> Optional[str]:
        """Safely extract thumbnail URL from entry"""
        try:
            thumbnails = entry.get('thumbnails', [])
            if thumbnails:
                return thumbnails[-1].get('url') if thumbnails else None
            return entry.get('thumbnail')
        except:
            return None

    def extract_video_info(self, video_id: str, preferred_lang: str = "none") -> Optional[Dict[str, Any]]:
        """Extract detailed video info including streams"""
        self._current_video_id = video_id
        try:
            # 先用基礎選項獲取基本資訊判斷是否為直播
            with yt_dlp.YoutubeDL(self.base_opts) as ydl:
                result = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

            if not result:
                return {"error": "yt_dlp returned empty result on first pass", "formats": []}

            is_live = result.get('is_live', False)
            print(f"[DEBUG] First pass (base_opts): is_live={is_live}, formats={len(result.get('formats', []))}", file=sys.stderr)
        
            # 根據是否為直播選擇對應的選項重新提取（確保格式正確）
            opts = self._get_opts(is_live)
            with yt_dlp.YoutubeDL(opts) as ydl:
                result = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

            if not result:
                return {"error": "yt_dlp returned empty result on second pass", "formats": []}

            formats = self._filter_formats(result.get('formats', []), is_live)
            subtitles = self._extract_subtitles(
                result.get('subtitles', {}),
                result.get('automatic_captions', {}),
                preferred_lang
            )

            # 處理 duration：直播時為 null，不強制轉 int
            duration = result.get('duration')
            if duration is not None:
                try:
                    duration = int(duration)
                except (ValueError, TypeError):
                    duration = None

            # 計算 resolved_language（供 auto 模式使用，取 tracks 中第一個軌道語言）
            resolved_lang = subtitles[0]['language'] if subtitles else ''

            return {
                'id': result.get('id', video_id),
                'title': result.get('title', '無標題'),
                'description': result.get('description', ''),
                'duration': duration,
                'thumbnail': self._get_thumbnail(result),
                'channel': result.get('uploader', '未知頻道'),
                'channel_id': result.get('channel_id', ''),
                'view_count': result.get('view_count'),
                'like_count': result.get('like_count'),
                'upload_date': result.get('upload_date'),
                'formats': formats,
                'subtitles': subtitles,
                'is_live': is_live,
                'resolved_language': resolved_lang,
            }
        except Exception as e:
            logger.error(f"Extract video info error: {e}")
            # 回傳錯誤詳情而非 None，方便 Rust 端診斷
            return {"error": str(e), "formats": []}

    def _filter_formats(self, formats: List[Dict], is_live: bool = False) -> List[Dict]:
        """Filter and sort formats for playback - keep all formats including DASH/HLS for 1080p+"""
        print(f"[DEBUG] Raw formats from yt-dlp: {len(formats)} total", file=sys.stderr)
        # 詳細列出所有原始格式
        for f in formats:
            proto = f.get('protocol', '')
            url = f.get('url')
            manifest = f.get('manifest_url')
            print(f"[DEBUG]   RAW fmt={f.get('format_id')} h={f.get('height')} tbr={f.get('tbr')} vcodec={f.get('vcodec')} acodec={f.get('acodec')} proto={proto} url_len={len(str(url)) if url else 0} manifest_url={bool(manifest)}", file=sys.stderr)
        filtered = []
        for f in formats:
            # Skip formats without video or audio
            if f.get('vcodec') == 'none' and f.get('acodec') == 'none':
                continue

            protocol = f.get('protocol', '')
            url = f.get('url')
            
            # For HLS streams, the url IS the manifest (m3u8 playlist)
            # For DASH, manifest_url might be separate
            manifest_url = f.get('manifest_url')
            if not manifest_url and url and ('m3u8' in protocol.lower() or 'hls' in protocol.lower()):
                manifest_url = url  # HLS: url is the manifest
            
            filtered.append({
                'format_id': f.get('format_id', ''),
                'ext': f.get('ext', ''),
                'resolution': f.get('resolution'),
                'width': f.get('width'),
                'height': f.get('height'),
                'fps': f.get('fps'),
                'vcodec': f.get('vcodec'),
                'acodec': f.get('acodec'),
                'url': url,
                'protocol': protocol,
                'filesize': f.get('filesize'),
                'tbr': f.get('tbr'),
                'language': f.get('language'),
                # Add manifest_url for DASH/HLS streaming
                'manifest_url': manifest_url,
                # Preserve HTTP headers (User-Agent) for libmpv to avoid YouTube 403
                'http_headers': f.get('http_headers', {}),
            })

        # Sort by quality (height descending)
        filtered.sort(key=lambda x: x.get('height') or 0, reverse=True)
        print(f"[DEBUG] Filtered formats: {len(filtered)} (protocols: {[f['protocol'] for f in filtered][:5]}...)", file=sys.stderr)
        for f in filtered[:10]:
            print(f"[DEBUG]   fmt={f['format_id']} h={f['height']} tbr={f['tbr']} vcodec={f['vcodec']} proto={f['protocol']} manifest={bool(f.get('manifest_url'))}", file=sys.stderr)
        return filtered

    def _extract_subtitles(self, subtitles: Dict, auto_captions: Dict, preferred_lang: str = "none") -> List[Dict]:
        """Extract subtitle tracks using youtube_transcript_api dual-track (run13.py approach).

        Downloads TWO subtitle files per video:
          1. YTA → clean standard VTT (via WebVTTFormatter)
          2. TimedText → native VTT (via transcript._url &fmt=vtt)

        Language priority:
          - preferred_lang == "auto": detect first available language via YTA.list(), download that language
          - preferred_lang == "none": no subtitles
          - specific (en, zh-Hans, zh-Hant, ja, es, de, fr): try that language first, fallback to first available
        """
        import os
        import re as _re

        tracks: List[Dict] = []
        cache_dir = self._get_cache_dir()
        video_id = getattr(self, '_current_video_id', '')

        print(f"[Subtitle DEBUG] _extract_subtitles called: video_id={video_id}, preferred_lang={preferred_lang}", file=sys.stderr)

        if not video_id:
            print("[Subtitle DEBUG] No video_id, returning empty", file=sys.stderr)
            return tracks

        if preferred_lang == "none":
            print("[Subtitle DEBUG] preferred_lang is none, returning empty", file=sys.stderr)
            return tracks

        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            from youtube_transcript_api.formatters import WebVTTFormatter
        except ImportError:
            logger.warning("[Subtitle] youtube_transcript_api not available")
            return tracks

        ytt_api = YouTubeTranscriptApi()
        vtt_formatter = WebVTTFormatter()

        try:
            transcript_list = ytt_api.list(video_id)
        except Exception as e:
            logger.warning(f"[Subtitle] YTA list failed for {video_id}: {e}")
            return tracks

        available_codes = [t.language_code for t in transcript_list]
        print(f"[Subtitle DEBUG] Available caption languages: {available_codes}", file=sys.stderr)

        if not available_codes:
            print(f"[Subtitle DEBUG] No subtitle tracks available for {video_id}", file=sys.stderr)
            return tracks

        # Determine target languages based on user preference
        if preferred_lang == "auto":
            target_langs = available_codes[:1]
            print(f"[Subtitle DEBUG] Auto mode: using first available language: {target_langs}", file=sys.stderr)
        else:
            # Specific language: try preferred first, fallback to first available
            target_langs = [lang for lang in [preferred_lang] if lang in available_codes]
            if not target_langs:
                target_langs = available_codes[:1]
                print(f"[Subtitle DEBUG] Preferred lang '{preferred_lang}' not available, using: {target_langs}", file=sys.stderr)
            else:
                print(f"[Subtitle DEBUG] Using preferred language: {target_langs}", file=sys.stderr)

        def _make_track(lang_code: str, source_tag: str, track_type: str, path: Optional[str], is_auto: bool) -> Dict:
            """Create a subtitle track dict.
            track_type: 'YTA' or 'TimedText' to distinguish the two sources.
            """
            return {
                'language': lang_code,
                'name': f'{lang_code} ({source_tag}, {track_type})',
                'url': '',
                'local_path': path or '',
                'ext': 'vtt',
                'is_auto': is_auto,
            }

        # ── Try 1: YTA for target language (manual or auto-generated) ──
        try:
            transcript = transcript_list.find_transcript(target_langs)
        except Exception as e:
            logger.warning(f"[Subtitle] find_transcript failed for {target_langs}: {e}")
            transcript = None

        target_lang_code = None
        target_source_tag = None
        if transcript is not None:
            target_lang_code = transcript.language_code
            target_source_tag = "manual" if not transcript.is_generated else "auto"
            print(f"[Subtitle DEBUG] Target: {transcript.language} ({target_lang_code}) | {target_source_tag.upper()}", file=sys.stderr)

        # ── Try 1: YTA for target language (with JSON3 fallback) ──
        yta_success = False
        if transcript is not None:
            lang_code = target_lang_code
            source_tag = target_source_tag
            try:
                fetched_data = transcript.fetch()
                yta_vtt = vtt_formatter.format_transcript(fetched_data)
                if yta_vtt.strip():
                    yta_filename = f"sub_{video_id}_{lang_code}_{source_tag}_yta.vtt"
                    yta_path = os.path.join(cache_dir, yta_filename)
                    with open(yta_path, 'w', encoding='utf-8') as f:
                        f.write(yta_vtt)
                    print(f"[Subtitle DEBUG] YTA VTT saved: {yta_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "YTA", yta_path, transcript.is_generated))
                    yta_success = True
            except Exception as e:
                print(f"[Subtitle DEBUG] YTA download failed: {e}", file=sys.stderr)
                # Fallback to JSON3 method (bypasses YTA API limitation)
                print(f"[Subtitle DEBUG] Trying JSON3 fallback for {lang_code}...", file=sys.stderr)
                json3_path = self._fetch_yta_json3(lang_code)
                if json3_path and os.path.exists(json3_path):
                    print(f"[Subtitle DEBUG] JSON3 VTT saved: {json3_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "YTA(JSON3)", json3_path, transcript.is_generated))
                    yta_success = True

        # ── Try 2: TimedText for target language (ALWAYS attempt if YTA succeeded too) ──
        if transcript is not None:
            lang_code = target_lang_code
            source_tag = target_source_tag
            print(f"[Subtitle DEBUG] Trying timedtext for {lang_code}...", file=sys.stderr)
            try:
                tts_url = f"{transcript._url}&fmt=vtt"
                import urllib.request
                req = urllib.request.Request(tts_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    raw = resp.read().decode('utf-8', errors='replace')
                if raw.strip().startswith('WEBVTT'):
                    fixed = (raw
                             .replace('align:start position:0%', 'align:center position:50%')
                             .replace('align:start', 'align:center'))
                    fixed = _re.sub(r'<[^>]+>', '', fixed)
                    tt_filename = f"sub_{video_id}_{lang_code}_{source_tag}_timedtext.vtt"
                    timedtext_path = os.path.join(cache_dir, tt_filename)
                    with open(timedtext_path, 'w', encoding='utf-8') as f:
                        f.write(fixed)
                    print(f"[Subtitle DEBUG] TimedText VTT saved: {timedtext_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "TimedText", timedtext_path, transcript.is_generated))
                else:
                    print(f"[Subtitle DEBUG] TimedText not VTT (starts with: {raw.strip()[:40]}...)", file=sys.stderr)
            except Exception as e:
                print(f"[Subtitle DEBUG] TimedText download failed: {e}", file=sys.stderr)

        # ── Try 3: Fallback to en timedtext (only if nothing found yet) ──
        if not tracks:
            if 'en' in available_codes:
                print("[Subtitle DEBUG] No target subtitles, trying en fallback...", file=sys.stderr)
                try:
                    en_transcript = transcript_list.find_transcript(['en'])
                    en_lang = en_transcript.language_code
                    en_source = "manual" if not en_transcript.is_generated else "auto"
                    print(f"[Subtitle DEBUG] EN fallback: {en_transcript.language} ({en_lang}) | {en_source.upper()}", file=sys.stderr)
                    # Try YTA first for en
                    en_yta_ok = False
                    try:
                        fetched = en_transcript.fetch()
                        vtt = vtt_formatter.format_transcript(fetched)
                        if vtt.strip():
                            fn = f"sub_{video_id}_en_{en_source}_yta.vtt"
                            fp = os.path.join(cache_dir, fn)
                            with open(fp, 'w', encoding='utf-8') as f:
                                f.write(vtt)
                            print(f"[Subtitle DEBUG] EN YTA VTT saved: {fp}", file=sys.stderr)
                            tracks.append(_make_track(en_lang, en_source, "YTA", fp, en_transcript.is_generated))
                            en_yta_ok = True
                    except Exception as e:
                        print(f"[Subtitle DEBUG] EN YTA failed: {e}", file=sys.stderr)
                    # Then timedtext for en
                    if not en_yta_ok:
                        try:
                            tts = f"{en_transcript._url}&fmt=vtt"
                            import urllib.request
                            req = urllib.request.Request(tts, headers={'User-Agent': 'Mozilla/5.0'})
                            with urllib.request.urlopen(req, timeout=15) as resp:
                                raw = resp.read().decode('utf-8', errors='replace')
                            if raw.strip().startswith('WEBVTT'):
                                fixed = (raw
                                         .replace('align:start position:0%', 'align:center position:50%')
                                         .replace('align:start', 'align:center'))
                                fixed = _re.sub(r'<[^>]+>', '', fixed)
                                fn = f"sub_{video_id}_en_{en_source}_timedtext.vtt"
                                fp = os.path.join(cache_dir, fn)
                                with open(fp, 'w', encoding='utf-8') as f:
                                    f.write(fixed)
                                print(f"[Subtitle DEBUG] EN TimedText VTT saved: {fp}", file=sys.stderr)
                                tracks.append(_make_track(en_lang, en_source, "TimedText", fp, en_transcript.is_generated))
                            else:
                                print("[Subtitle DEBUG] EN TimedText not VTT", file=sys.stderr)
                        except Exception as e:
                            print(f"[Subtitle DEBUG] EN TimedText failed: {e}", file=sys.stderr)
                except Exception as e:
                    print(f"[Subtitle DEBUG] EN fallback failed: {e}", file=sys.stderr)

        if not tracks:
            print(f"[Subtitle DEBUG] No subtitle tracks downloaded for {video_id}", file=sys.stderr)

        return tracks

    def _get_cache_dir(self) -> str:
        """Get local cache directory for storing downloaded subtitles (Windows Sidecar)."""
        import os
        import tempfile
        # 使用系統 temp 目錄，避免 Program Files 無寫入權限的問題
        sub_dir = os.path.join(tempfile.gettempdir(), 'NoadYT-Desktop', 'subtitles')
        os.makedirs(sub_dir, exist_ok=True)
        return sub_dir

    def _build_vtt_from_entries(self, entries, lang: str) -> Optional[str]:
        """Build VTT content from YouTubeTranscriptApi entries (new API: list of dict via to_raw_data)."""
        import re
        try:
            if not entries:
                return None
            vtt_lines = ['WEBVTT', '']
            for entry in entries:
                if isinstance(entry, dict):
                    start = entry.get('start', 0)
                    duration = entry.get('duration', 2.0)
                    text = entry.get('text', '')
                else:
                    start = getattr(entry, 'start', 0)
                    duration = getattr(entry, 'duration', 2.0)
                    text = getattr(entry, 'text', '')
                if not text:
                    continue
                start_ms = int(start * 1000)
                end_ms = int((start + duration) * 1000)
                if end_ms <= start_ms:
                    end_ms = start_ms + 1000
                start_ts = self._ms_to_vtt_ts(start_ms)
                end_ts = self._ms_to_vtt_ts(end_ms)
                safe_text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                safe_text = re.sub(r'<[^>]+>', '', safe_text)
                vtt_lines.append(f'{start_ts} --> {end_ts}')
                vtt_lines.append(safe_text)
                vtt_lines.append('')
            vtt_content = '\n'.join(vtt_lines) + '\n'
            if len(vtt_lines) <= 2:
                return None
            return vtt_content
        except Exception as e:
            logger.warning(f"[Subtitle] _build_vtt_from_entries failed: {e}")
            return None

    def _download_and_cache_vtt(self, url: str, filename: str, cache_dir: str) -> Optional[str]:
        """Download VTT subtitle content and save to local cache with centered alignment."""
        import os
        import urllib.request
        try:
            filepath = os.path.join(cache_dir, filename)
            # 如果舊緩存存在，先驗證是否為真正的 VTT；若不是（如舊 M3U8），刪除重新下載
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                    head = f.read(200)
                if head.strip().startswith('WEBVTT'):
                    return filepath
                os.remove(filepath)
                logger.warning(f"[Subtitle] Removed stale non-VTT cache: {filepath}")
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode('utf-8', errors='replace')
            # 只有真正的 VTT（以 WEBVTT 開頭）才緩存；YouTube timedtext 對自動字幕常返回 M3U8（#EXTM3U），跳過
            if not raw.strip().startswith('WEBVTT'):
                logger.warning(f"[Subtitle] Not VTT content (starts with: {raw.strip()[:40]}...), skipping cache")
                return None
            # 把 YouTube 預設的靠左對齊改成置中 + 底部
            fixed = (raw
                     .replace('align:start position:0%', 'align:center position:50%')
                     .replace('align:start', 'align:center'))
            # 移除所有 <span ...>...</span> HTML tag
            fixed = re.sub(r'<[^>]+>', '', fixed)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(fixed)
            logger.info(f"[Subtitle] Cached patched VTT: {filepath} ({len(fixed)} chars)")
            return filepath
        except Exception as e:
            logger.error(f"Download/cache VTT failed: {e}")
            return None

    def _fetch_yta_json3(self, lang: str) -> Optional[str]:
        """YouTubeTranscriptApi replacement: fetch auto captions via timedtext fmt=json3.
        Returns local VTT path or None. No extra Python module needed."""
        import os
        import json as _json
        import urllib.request
        import urllib.error
        video_id = getattr(self, '_current_video_id', '')
        if not video_id:
            return None
        try:
            # YouTube timedtext JSON3 endpoint for auto captions
            json3_url = (f"https://www.youtube.com/api/timedtext"
                         f"?v={video_id}&lang={lang}&fmt=json3")
            req = urllib.request.Request(json3_url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    status = resp.getcode()
                    raw = resp.read().decode('utf-8', errors='replace')
                logger.info(f"[Subtitle] JSON3 [{lang}] HTTP {status} for [{video_id}], body={raw[:200]}")
            except urllib.error.HTTPError as he:
                logger.warning(f"[Subtitle] JSON3 [{lang}] HTTPError code={he.code} for [{video_id}], body={he.read().decode('utf-8', errors='replace')[:200]}")
                return None
            except urllib.error.URLError as ue:
                logger.warning(f"[Subtitle] JSON3 [{lang}] URLError reason={ue.reason} for [{video_id}]")
                return None
            data = _json.loads(raw)
            events = data.get('events', [])
            if not events:
                logger.warning(f"[Subtitle] JSON3 [{lang}] no events for [{video_id}]")
                return None
            # Convert JSON3 to VTT
            vtt_lines = ['WEBVTT\n\n']
            for ev in events:
                t_start = int(ev.get('tStartMs', '0'))
                d_dur = int(ev.get('dDurationMs', '0'))
                segs = ev.get('segs', [])
                text = ''.join(s.get('utf8', '') for s in segs)
                if not text:
                    continue
                start_ts = self._ms_to_vtt_ts(t_start)
                end_ts = self._ms_to_vtt_ts(t_start + d_dur)
                vtt_lines.append(f'{start_ts} --> {end_ts}\n{text}\n\n')
            vtt_content = ''.join(vtt_lines)
            # Cache it
            cache_dir = self._get_cache_dir()
            vtt_path = os.path.join(cache_dir, f"sub_auto_{video_id}_{lang}.vtt")
            with open(vtt_path, 'w', encoding='utf-8') as f:
                f.write(vtt_content)
            logger.info(f"[Subtitle] JSON3 HIT [{lang}] for [{video_id}]")
            return vtt_path
        except Exception as e:
            logger.warning(f"[Subtitle] JSON3 [{lang}] exception: {type(e).__name__}: {e}")
            return None

    @staticmethod
    def _ms_to_vtt_ts(ms: int) -> str:
        """Convert milliseconds to VTT timestamp HH:MM:SS.mmm"""
        h = ms // 3600000
        m = (ms % 3600000) // 60000
        s = (ms % 60000) // 1000
        ms_rem = ms % 1000
        return f'{h:02d}:{m:02d}:{s:02d}.{ms_rem:03d}'

    @staticmethod
    def _convert_subtitle_fmt_to_vtt(url: str) -> str:
        """將字幕 URL 中的 fmt 參數轉換為 vtt（ExoPlayer 原生支援的格式）"""
        import re
        # 替換 fmt=json3 或 fmt=srv1 等為 fmt=vtt
        return re.sub(r'[?&]fmt=[^&]+', '&fmt=vtt', url) if 'fmt=' in url else url + ('&fmt=vtt' if '?' in url else '?fmt=vtt')

    def get_playlist(self, playlist_id: str) -> List[Dict[str, Any]]:
        """Extract playlist videos"""
        try:
            with yt_dlp.YoutubeDL({'extract_flat': True, 'quiet': True}) as ydl:
                result = ydl.extract_info(f"https://www.youtube.com/playlist?list={playlist_id}", download=False)

                if result and 'entries' in result:
                    videos = []
                    for entry in result['entries']:
                        if entry and isinstance(entry, dict):
                            videos.append({
                                'id': entry.get('id', ''),
                                'title': entry.get('title', '無標題'),
                                'duration': entry.get('duration'),
                                'thumbnail': self._get_thumbnail(entry),
                            })
                    return videos
        except Exception as e:
            logger.error(f"Playlist error: {e}")

        return []


# Global instance for reuse
_extractor = YouTubeExtractor()

def search_videos(query: str, max_results: int = 60) -> str:
    """Search YouTube videos - returns JSON string with up to 60 results"""
    results = _extractor.search(query, max_results)
    return json.dumps(results, ensure_ascii=False)

def get_video_info(video_id: str, subtitle_pref: str = "none") -> str:
    """Get detailed video info - returns JSON string"""
    info = _extractor.extract_video_info(video_id, subtitle_pref)
    if info is None:
        # 返回錯誤信息，方便診斷 MSI 環境下的失敗原因
        return json.dumps({"error": "extract_video_info returned None", "formats": []}, ensure_ascii=False)
    return json.dumps(info, ensure_ascii=False)


def download_subtitle_to_file(video_id: str, lang: str) -> str:
    """從已提取的字幕列表中找對應語言的 timedtext URL，回傳 file:// URI（實質上是即時 URL）。"""
    try:
        # 這裡不再需要真的下載——YT timedtext URL 只需在當次 session 有效即可
        # 所以直接回傳空字串，讓 Kotlin 端使用 currentVideoInfo.subtitles 中的即時 URL
        logger.info(f"subtitle download requested for lang={lang} (will use in-memory URL instead)")
        return ""
    except Exception as e:
        logger.error(f"download_subtitle_to_file error: {e}")
        return ""


def get_playlist_videos(playlist_id: str) -> str:
    """Get playlist videos - returns JSON string"""
    results = _extractor.get_playlist(playlist_id)
    return json.dumps(results, ensure_ascii=False)


def get_target_video_url(video_id: str, max_height: int) -> str:
    """用 yt-dlp 直接讀取 formats（同一份 player_client），手動篩選目標高度影片 URL。
    優先返回非 manifest 的單一檔案 URL（可精確控管解析度）；若只有 manifest 則回傳空字串，
    讓 Kotlin 端 fallback 到 get_target_video_url_web()。
    """
    import yt_dlp
    try:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'format': 'best',
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            if not result:
                logger.error(f"[TargetURL] no result for video={video_id}")
                return ""
            all_fmts = result.get('formats', []) or []
            logger.info(f"[TargetURL] raw_formats={len(all_fmts)} target_h={max_height}")

            # step1: DASH/HLS manifest（按高度篩選後取最高 bitrate）
            cands = [f for f in all_fmts
                     if f.get('height') is not None
                     and (f.get('height') or 0) <= max_height
                     and (f.get('vcodec') != 'none')]
            if not cands:
                logger.error(f"[TargetURL] NO MATCH for h<{max_height} total={len(all_fmts)}")
                return ""

            m3u8 = [f for f in cands if 'm3u8' in (f.get('protocol') or '').lower()]
            dash  = [f for f in cands if 'dash' in (f.get('protocol') or '').lower()]
            pick = (m3u8 or dash or cands)
            chosen = max(pick, key=lambda x: x.get('tbr') or 0)
            url = chosen.get('manifest_url') or chosen.get('url') or ''
            logger.info(f"[TargetURL] matched_manifest h={chosen.get('height')} proto={chosen.get('protocol')} tbr={chosen.get('tbr')} url_len={len(url)}")
            # 檢查 URL 有效性：必須是真實 HTTPS URL，不能太短或包含特殊標記
            is_valid = (url.startswith('https://') and len(url) > 50
                        and 'signatureDecode' not in url)
            if not is_valid:
                logger.warning(f"[TargetURL] Invalid URL: len={len(url)} proto={chosen.get('protocol')}")
                return ""
            # 如果是 manifest URL，告知 Kotlin 需要 fallback 到 web client
            is_adaptive = 'm3u8' in (chosen.get('protocol') or '').lower() \
                or 'dash' in (chosen.get('protocol') or '').lower()
            logger.info(f"[TargetURL] is_adaptive={is_adaptive} will_use_fallback={is_adaptive}")
            return url
    except Exception as e:
        logger.error(f"get_target_video_url error: {e}")
        return ""


def get_target_video_url_web(client_version: str = '19.29.1') -> str:
    """使用 web client 精確取得指定高度的 progressive 影片 URL。
    web client 不返回 m3u8_native，而是返回真正的 MP4/WebM progressive URL，
    可透過 ExoPlayer 正確播放指定解析度的單一檔案。
    """
    import yt_dlp
    try:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            # Web client 通常不需要指定 client_version，但保留以防萬一
            'extractor_args': {'youtube': {}},
            'format': 'best[height<=480]/best[height<=720]/best',
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            result = ydl.extract_info(
                "https://www.youtube.com/watch?v=" + _last_target_video_id,
                download=False)
            if not result:
                return ""
            all_fmts = result.get('formats', []) or []
            # 找 progressive（video+audio合一）
            prog = [f for f in all_fmts
                    if f.get('vcodec') != 'none'
                    and f.get('acodec') != 'none'
                    and f.get('ext') == 'mp4'
                    and (f.get('protocol','').startswith('https'))
                    and (f.get('height') or 0) <= 480]
            if prog:
                chosen = max(prog, key=lambda x: x.get('tbr') or 0)
                url = chosen.get('url') or ''
                logger.info(f"[WebClient] matched mp4_merged h={chosen.get('height')} url_len={len(url)}")
                return url
            # 退而求其次：任何 progressive（不限 mp4）
            prog2 = [f for f in all_fmts
                     if f.get('vcodec') != 'none'
                     and f.get('acodec') != 'none'
                     and (f.get('protocol','').startswith('https'))]
            if prog2:
                chosen = max(prog2, key=lambda x: x.get('tbr') or 0)
                url = chosen.get('url') or ''
                logger.info(f"[WebClient] matched any_prog h={chosen.get('height')} url_len={len(url)}")
                return url
            logger.warning(f"[WebClient] no progressive found from web client, total={len(all_fmts)}")
            return ""
    except Exception as e:
        logger.error(f"get_target_video_url_web error: {e}")
        return ""

pass


def _extract_best_avatar(thumbnails: list) -> Optional[str]:
    """從 thumbnails 列表選取最佳大頭貼（square，優先 uncropped）"""
    if not thumbnails:
        return None
    for t in thumbnails:
        if t.get("id") == "avatar_uncropped":
            return t.get("url")
    avatars = [
        t for t in thumbnails
        if t.get("width") and t.get("height") and t["width"] == t["height"]
    ]
    if avatars:
        return max(avatars, key=lambda x: x["width"]).get("url")
    return thumbnails[-1].get("url")


def _fetch_single_channel_details(basic_info: dict) -> dict:
    """取得單一頻道的詳細資訊（訂閱數、簡介、大頭貼）」"""
    ch_id = basic_info["channel_id"]
    url = f"https://www.youtube.com/channel/{ch_id}"
    opts = {
        "extractor_args": {"youtube": {"player_client": ["ios", "android_tv_embedded"], "client_version": "19.29.1"}},
        "extract_flat": True,
        "playlistend": 1,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            thumbs = info.get("thumbnails", [])
            return {
                "channel_id": ch_id,
                "title": basic_info["title"],
                "follower_count": info.get("channel_follower_count"),
                "description": "",
                "thumbnail": _extract_best_avatar(thumbs),
            }
        except Exception as e:
            print(f"[Channel] 抓取 {basic_info['title']} 失敗: {e}")
            return {
                "channel_id": ch_id, "title": basic_info["title"],
                "follower_count": None, "description": "", "thumbnail": None,
            }


def search_channels(keyword: str, max_results: int = 30) -> str:
    """搜尋 YouTube 頻道，回傳 JSON 字串（格式與 search_videos 一致）"""
    print(f"搜尋頻道：{keyword}，上限 {max_results} 個...")
    search_limit = int(max_results * 1.3)  # 稍微擴大搜尋基數，確保去重後能湊滿 max_results
    search_query = f"ytsearch{search_limit}:{keyword}"
    opts = {
        "extractor_args": {"youtube": {"player_client": ["ios", "android_tv_embedded"], "client_version": "19.29.1"}},
        "extract_flat": True,
        "quiet": True,
        "no_warnings": True,
        "timeout": 15,
        "socket_timeout": 15,
    }
    seen_ids: set = set()
    results = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        result = ydl.extract_info(search_query, download=False) or {}
        for entry in result.get("entries", []) or []:
            if not entry:
                continue
            cid = entry.get("channel_id")
            name = entry.get("channel") or entry.get("uploader", "")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                results.append({
                    "channel_id": cid,
                    "title": name,
                    "follower_count": None,  # 跳過逐一抓詳情，先回傳基本結果，加快搜尋
                    "description": "",
                    "thumbnail": None,  # 跳過逐一抓詳情，圖片可稍後非同步載入
                })
                if len(results) >= max_results:
                    break
    print(f"已找到 {len(results)} 個頻道，逐一抓詳情...")
    import concurrent.futures
    detailed = [None] * len(results)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_to_idx = {
            executor.submit(_fetch_single_channel_details, ch): i
            for i, ch in enumerate(results)
        }
        for future in concurrent.futures.as_completed(future_to_idx):
            idx = future_to_idx[future]
            detailed[idx] = future.result()
    return json.dumps(detailed, ensure_ascii=False)


def get_channel_videos(channel_url: str, max_videos: int = 40) -> str:
    """抓取指定頻道最新影片，回傳 VideoSearchResult 格式的 JSON 字串"""
    clean_url = channel_url.strip().rstrip("/")
    if not clean_url.endswith("/videos"):
        clean_url += "/videos"
    base_url = channel_url.strip().rstrip("/")
    opts = {
        "extractor_args": {"youtube": {"player_client": ["ios", "android_tv_embedded"], "client_version": "19.29.1"}},
        "extract_flat": True,
        "playlistend": max_videos,
        "quiet": True,
        "no_warnings": True,
    }
    videos: list = []
    with yt_dlp.YoutubeDL(opts) as ydl:
        try:
            info = ydl.extract_info(clean_url, download=False)
            chan_name = info.get("channel") or info.get("uploader") or info.get("title", "")
            for entry in (info.get("entries") or []):
                if not entry:
                    continue
                vid_id = entry.get("id")
                dur = entry.get("duration") or 0
                h, rem = divmod(dur, 3600)
                m, s = divmod(rem, 60)
                dur_str = f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m:02d}:{s:02d}"
                thumb_list = entry.get("thumbnails") or []
                thumb = thumb_list[-1].get("url") if thumb_list else None
                videos.append({
                    "id": vid_id,
                    "title": entry.get("title", ""),
                    "duration": dur,
                    "thumbnail": thumb,
                    "channel": chan_name,
                    "channel_id": "",
                    "view_count": None,
                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                    "upload_date": None,
                    "_dur_str": dur_str,   # Android 端顯示用，不影響 VideoSearchResult
                })
        except Exception as e:
            print(f"[ChannelVideos] 錯誤: {e}")
    return json.dumps(videos, ensure_ascii=False)



def build_youtube_url(video_id: str) -> str:
    """動態組裝 YouTube 觀看頁面 URL"""
    host = '.'.join(['www', 'youtube', 'com'])
    return urlunparse(('https', host, '/watch', '', f'v={video_id}', ''))


def parse_max_resolution(max_res: str | int | None) -> int | None:
    if max_res is None:
        return None
    if isinstance(max_res, int):
        return max_res if max_res > 0 else None
    val = str(max_res).strip().lower().rstrip('p')
    if val in ('', 'auto', 'none', 'max', 'best'):
        return None
    if val.isdigit() and int(val) > 0:
        return int(val)
    return None


def build_format_str(is_live: bool, p_name: str, max_res: int | None) -> str:
    h_filter = f'[height<={max_res}]' if max_res else ''

    if is_live and p_name == 'mpv':
        if LIVE_PREFER_30FPS:
            return (
                f'bestvideo{h_filter}[fps<=30][vcodec^=avc1]+bestaudio/'
                f'bestvideo{h_filter}[vcodec^=avc1]+bestaudio/'
                f'best{h_filter}/best'
            )
        return (
            f'bestvideo{h_filter}[vcodec^=avc1]+bestaudio/'
            f'best{h_filter}/best'
        )

    if is_live:
        return f'best{h_filter}[vcodec!=none][acodec!=none]/best{h_filter}/best'

    return f'bestvideo{h_filter}+bestaudio/best{h_filter}/best'


def find_vlc() -> str | None:
    env_vlc = shutil.which('vlc')
    if env_vlc:
        return env_vlc
    p1 = r'C:\Program Files\VideoLAN\VLC\vlc.exe'
    p2 = r'C:\Program Files (x86)\VideoLAN\VLC\vlc.exe'
    for p in (p1, p2):
        if os.path.exists(p):
            return p
    return None


def find_mpv() -> str | None:
    env_mpv = shutil.which('mpv')
    if env_mpv:
        return env_mpv
    p1 = r'C:\mpv\mpv.exe'
    p2 = r'C:\Program Files\mpv\mpv.exe'
    p3 = os.path.expanduser(r'~\scoop\apps\mpv\current\mpv.exe')
    for p in (p1, p2, p3):
        if os.path.exists(p):
            return p
    return None


def resolve_player(preferred: str, is_live: bool = False) -> tuple[str | None, str | None]:
    """參考 run19.py：直播一律使用 MPV，不管使用者選什麼播放器"""
    vlc_exe = find_vlc()
    mpv_exe = find_mpv()

    if is_live and AUTO_USE_MPV_FOR_LIVE and mpv_exe:
        return 'mpv', mpv_exe

    pref = preferred.strip().lower()
    if pref == 'vlc':
        if vlc_exe:
            return 'vlc', vlc_exe
        if mpv_exe:
            return 'mpv', mpv_exe
    else:
        if mpv_exe:
            return 'mpv', mpv_exe
        if vlc_exe:
            return 'vlc', vlc_exe
    return None, None


def download_subtitles_tempdir(video_id: str, target_languages: list[str], sub_dir: str) -> str | None:
    """字幕下載至指定目錄，供 MPV/VLC 讀取"""
    if not target_languages:
        print('[Subtitle] Language list is empty, skipping subtitle download.', file=sys.stderr)
        return None

    ytt_api = YouTubeTranscriptApi()
    vtt_formatter = WebVTTFormatter()
    yta_file = None
    native_file = None

    try:
        t_list = ytt_api.list(video_id)
        print(f'=== Available subtitles for {video_id} ===', file=sys.stderr)
        avail = []
        for t in t_list:
            tag = 'Manual' if not t.is_generated else 'ASR'
            print(f'- {t.language} ({t.language_code}) -> [{tag}]', file=sys.stderr)
            avail.append(t.language_code)

        if not avail:
            print('No subtitles available.', file=sys.stderr)
            return None

        search = [lang for lang in target_languages if lang in avail]
        if not search:
            search = [next(iter(avail))]
            print(f'Fallback language: {search}', file=sys.stderr)

        transcript = t_list.find_transcript(search)
        code = transcript.language_code
        src = 'manual' if not transcript.is_generated else 'auto'
        print(f'Selected subtitle: {transcript.language} ({code}) [{src}]', file=sys.stderr)

        # YTA
        try:
            data = transcript.fetch()
            vtt_text = vtt_formatter.format_transcript(data)
            if vtt_text.strip():
                f_yta = os.path.join(sub_dir, f'{video_id}_{code}_{src}_yta.vtt')
                with open(f_yta, 'w', encoding='utf-8') as f:
                    f.write(vtt_text)
                yta_file = f_yta
                print(f'[OK 1/2] Saved YTA VTT: {f_yta}', file=sys.stderr)
        except Exception as e:
            print(f'[Fail 1/2] YTA VTT error: {e}', file=sys.stderr)

        # TimedText
        try:
            res = requests.get(f'{transcript._url}&fmt=vtt', timeout=10)
            res.raise_for_status()
            if res.text.strip():
                f_nat = os.path.join(sub_dir, f'{video_id}_{code}_{src}_timedtext.vtt')
                with open(f_nat, 'w', encoding='utf-8') as f:
                    f.write(res.text)
                native_file = f_nat
                print(f'[OK 2/2] Saved native VTT: {f_nat}', file=sys.stderr)
        except Exception as e:
            print(f'[Fail 2/2] Native VTT error: {e}', file=sys.stderr)

    except TranscriptsDisabled:
        print(f'Subtitles disabled for {video_id}.', file=sys.stderr)
    except VideoUnavailable:
        print(f'Video {video_id} unavailable.', file=sys.stderr)
    except NoTranscriptFound:
        print(f'No transcript found for {target_languages}.', file=sys.stderr)
    except Exception as e:
        print(f'Subtitle error: {e}', file=sys.stderr)

    if native_file and os.path.exists(native_file):
        print(f'[Subtitle] Using native: {native_file}', file=sys.stderr)
        return native_file
    if yta_file and os.path.exists(yta_file):
        print(f'[Subtitle] Using YTA: {yta_file}', file=sys.stderr)
        return yta_file

    print('[Subtitle] Playing without subtitles.', file=sys.stderr)
    return None


def launch_detached(cmd: list[str]):
    """以獨立背景程序啟動播放器，避免卡住 Tauri 主程式"""
    import subprocess
    if sys.platform == 'win32':
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(cmd, creationflags=flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    else:
        subprocess.Popen(cmd, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)


def play_video(video_id: str, player_pref: str, subtitle_lang: str, max_resolution: str = 'auto'):
    """run19.py 播放邏輯：偵測 LIVE/一般影片，自動選擇播放器，支援字幕、解析度設定"""
    import tempfile

    url = build_youtube_url(video_id)
    # 字幕語言：'none'/'' = 不要字幕（PREFERRED_LANGUAGES = []，不下載）；
    # 'auto' = 依優先清單自動偵測；其他 = 指定語言
    if subtitle_lang in ('none', ''):
        target_langs = []
    elif subtitle_lang == 'auto':
        target_langs = ['zh-TW', 'zh-Hant', 'zh-Hans', 'zh', 'en', 'ja']
    else:
        target_langs = [subtitle_lang]
    parsed_res = parse_max_resolution(max_resolution)
    res_label = f'Max {parsed_res}p' if parsed_res else 'auto (Best)'

    try:
        opts = {'format': 'bestvideo+bestaudio/best', 'quiet': True, 'no_warnings': True,
                'js_runtimes': {'node': {}}, 'remote_components': 'ejs:github'}
        with yt_dlp.YoutubeDL(opts) as ydl:
            meta = ydl.extract_info(url, download=False)

        is_live = bool(meta.get('is_live'))
        title = meta.get('title', 'Unknown Title')

        p_name, p_exe = resolve_player(player_pref, is_live=is_live)
        if not p_name or not p_exe:
            return json.dumps({'error': '找不到 MPV 或 VLC 播放器'}, ensure_ascii=False)
            sys.exit(1)

        # 字幕：僅非直播時下載，存放於 tempdir/NoadYT-Desktop/subtitles/
        sub_path = None
        if not is_live:
            sub_dir = os.path.join(tempfile.gettempdir(), 'NoadYT-Desktop', 'subtitles')
            os.makedirs(sub_dir, exist_ok=True)
            sub_path = download_subtitles_tempdir(video_id, target_langs, sub_dir)

        # 取得串流 URL（參考 run19.py fetch_urls）
        fmt = build_format_str(is_live, p_name, parsed_res)
        ydl_opts = {'format': fmt, 'quiet': True, 'no_warnings': True,
                    'js_runtimes': {'node': {}}, 'remote_components': 'ejs:github'}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        fmts = info.get('requested_formats')
        if fmts and len(fmts) >= 2:
            it = iter(fmts)
            v_url = next(it)['url']
            a_url = next(it)['url']
        else:
            v_url = info.get('url', '')
            a_url = None

        # 構建命令（嚴格按照 run19.py make_cmd）
        if p_name == 'vlc':
            cmd = [
                p_exe,
                v_url,                              # URL 必須在最前面
                f'--meta-title={title}',           # --meta-title（不是 --force-media-title）
                '--network-caching=3000',
                '--play-and-exit',
            ]
            if a_url:
                cmd.append(f'--input-slave={a_url}')
            if sub_path:
                cmd.append(f'--sub-file={sub_path}')
        else:
            cmd = [p_exe, f'--force-media-title={title}']
            if is_live:
                lf = f'--ytdl-format={build_format_str(is_live, p_name, parsed_res)}'
                cmd.extend([lf, '--hwdec=auto-safe', '--video-sync=audio', '--framedrop=vo',
                           '--cache=yes', '--demuxer-readahead-secs=5', '--demuxer-max-bytes=50M'])
                if LIVE_AUDIO_DELAY != 0.0:
                    cmd.append(f'--audio-delay={LIVE_AUDIO_DELAY}')
            cmd.append(v_url)
            if a_url:
                cmd.append(f'--audio-file={a_url}')
            if sub_path:
                cmd.append(f'--sub-file={sub_path}')

        launch_detached(cmd)
        return json.dumps({'ok': True, 'player': p_name, 'exe': p_exe, 'is_live': is_live, 'title': title}, ensure_ascii=False)

    except Exception as e:
        print(f'[PLAY ERROR] {e}', file=sys.stderr)
        _emit({'error': f'播放失敗: {e}'})
        sys.exit(1)




# ═════════════════════════════════════════════════════════════════
# Windows Sidecar CLI entry (Tauri Rust 呼叫此腳本，讀取 stdout JSON)
# ═════════════════════════════════════════════════════════════════
def get_stream_urls(video_id: str, subtitle_lang: str, max_resolution: str = 'auto') -> str:
    """run19.py 同源的串流來源：給 Tauri 內建 libmpv 用。

    與外部播放器 play_video 取 URL 的方式完全一致（同一支 yt-dlp、
    同一套 build_format_str 選軌），確保內建/外部品質一致：
    - 直播：mpv 格式字串（LIVE_PREFER_30FPS → 30fps AVC 優先）
    - 一般：bestvideo+bestaudio/best/best（依 max_res 限制）
    - 音訊軌：abr/tbr 取最高（不挑第一條）
    - 字幕：subtitle_lang='none' 時不載入，與 play_video 同邏輯

    回傳 JSON: {ok, video_url, audio_url, user_agent, is_live, title,
               subtitles:[{language,name,path}]}
    """
    import tempfile

    url = build_youtube_url(video_id)
    if subtitle_lang in ('none', ''):
        target_langs: list[str] = []
    elif subtitle_lang == 'auto':
        target_langs = ['zh-TW', 'zh-Hant', 'zh-Hans', 'zh', 'en', 'ja']
    else:
        target_langs = [subtitle_lang]

    try:
        opts = {'format': 'bestvideo+bestaudio/best', 'quiet': True, 'no_warnings': True,
                'js_runtimes': {'node': {}}, 'remote_components': 'ejs:github'}
        with yt_dlp.YoutubeDL(opts) as ydl:
            meta = ydl.extract_info(url, download=False)

        is_live = bool(meta.get('is_live'))
        title = meta.get('title', 'Unknown Title')
        parsed_res = parse_max_resolution(max_resolution)

        # 與 play_video 完全相同的 format 字串（直播用 mpv 邏輯）
        fmt = build_format_str(is_live, 'mpv', parsed_res)
        ydl_opts = {'format': fmt, 'quiet': True, 'no_warnings': True,
                    'js_runtimes': {'node': {}}, 'remote_components': 'ejs:github'}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        requested = info.get('requested_formats')
        user_agent = ''
        if requested and len(requested) >= 2:
            # format 字串 'bestvideo+bestaudio'：requested[0]=影像軌、requested[1]=音訊軌（與 run19.py 相同取法）
            # 注意：不能用 max(abr/tbr) 挑音訊軌 — 影像軌的 tbr 遠大於音訊，會把影像 URL 誤當音訊
            v_url = requested[0].get('url', '')
            a_url = requested[1].get('url', '')
            headers = requested[0].get('http_headers') or {}
            user_agent = headers.get('User-Agent') or headers.get('user-agent') or ''
        else:
            v_url = info.get('url', '')
            a_url = ''
            headers = info.get('http_headers') or {}
            user_agent = headers.get('User-Agent') or headers.get('user-agent') or ''

        # 字幕：與 play_video 相同的下載目錄與語言邏輯
        subs: list[Dict[str, str]] = []
        if not is_live and target_langs:
            sub_dir = os.path.join(tempfile.gettempdir(), 'NoadYT-Desktop', 'subtitles')
            os.makedirs(sub_dir, exist_ok=True)
            sub_path = download_subtitles_tempdir(video_id, target_langs, sub_dir)
            if sub_path:
                # 檔名格式：{video_id}_{code}_{src}_{yta|timedtext}.vtt
                base = os.path.basename(sub_path)
                parts = base.split('_')
                code = parts[1] if len(parts) > 1 else 'unknown'
                subs.append({'language': code, 'name': code, 'path': sub_path})

        return json.dumps({
            'ok': True,
            'video_url': v_url,
            'audio_url': a_url,
            'user_agent': user_agent or 'Mozilla/5.0',
            'is_live': is_live,
            'title': title,
            'subtitles': subs,
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False)


if __name__ == "__main__":
    import sys
    import json

    def _emit(obj: dict) -> None:
        """Emit JSON to stdout as UTF-8 bytes, avoiding Windows cp950 console encoding issues."""
        text = json.dumps(obj, ensure_ascii=False)
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout.buffer.write((text + '\n').encode('utf-8', errors='replace'))
            sys.stdout.buffer.flush()
        else:
            print(text)

    if len(sys.argv) < 2:
        _emit({"error": "usage: python youtube_extractor.py --search <keyword> | --info <video_id> [lang] | --play <video_id> <player> [lang] [max_resolution]"})
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        if cmd == "--search" and len(sys.argv) >= 3:
            _emit(json.loads(search_videos(sys.argv[2])))
        elif cmd == "--info" and len(sys.argv) >= 3:
            pref = sys.argv[3] if len(sys.argv) >= 4 else "none"
            _emit(json.loads(get_video_info(sys.argv[2], pref)))
        elif cmd == "--stream" and len(sys.argv) >= 3:
            video_id = sys.argv[2]
            lang = sys.argv[3] if len(sys.argv) >= 4 else "auto"
            max_res = sys.argv[4] if len(sys.argv) >= 5 else "auto"
            _emit(json.loads(get_stream_urls(video_id, lang, max_res)))
        elif cmd == "--play" and len(sys.argv) >= 4:
            video_id = sys.argv[2]
            player_pref = sys.argv[3]
            lang = sys.argv[4] if len(sys.argv) >= 5 else "auto"
            max_res = sys.argv[5] if len(sys.argv) >= 6 else "auto"
            play_video(video_id, player_pref, lang, max_res)
        elif cmd == "--prepare" and len(sys.argv) >= 4:
            video_id = sys.argv[2]
            player_pref = sys.argv[3]
            lang = sys.argv[4] if len(sys.argv) >= 5 else "auto"
            max_res = sys.argv[5] if len(sys.argv) >= 6 else "auto"
            play_video(video_id, player_pref, lang, max_res)
        else:
            _emit({"error": "unknown command or missing argument"})
            sys.exit(1)
    except Exception as e:
        _emit({"error": str(e)})
        sys.exit(1)
