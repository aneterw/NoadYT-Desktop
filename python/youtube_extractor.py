# NoadYTTV - Python Integration Module
# This module provides the bridge between Kotlin and yt-dlp via Chaquopy

import yt_dlp
import json
import logging
import re
import sys
from typing import Dict, List, Optional, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

            # 字幕設定
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['zh-Hant', 'en', 'ja-orig', 'ja', 'zh-Hans', 'ko'],
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

        try:
            # find_transcript prioritizes manual over auto-generated
            transcript = transcript_list.find_transcript(target_langs)
        except Exception as e:
            logger.warning(f"[Subtitle] find_transcript failed for {target_langs}: {e}")
            return tracks

        lang_code = transcript.language_code
        source_tag = "manual" if not transcript.is_generated else "auto"
        print(f"[Subtitle DEBUG] Locked: {transcript.language} ({lang_code}) | source: {source_tag.upper()}", file=sys.stderr)

        # ── Download 1: YTA → clean standard VTT ──
        yta_path = None
        try:
            fetched_data = transcript.fetch()
            yta_vtt = vtt_formatter.format_transcript(fetched_data)
            if yta_vtt.strip():
                yta_filename = f"sub_{video_id}_{lang_code}_{source_tag}_yta.vtt"
                yta_path = os.path.join(cache_dir, yta_filename)
                with open(yta_path, 'w', encoding='utf-8') as f:
                    f.write(yta_vtt)
                print(f"[Subtitle DEBUG] YTA VTT saved: {yta_path}", file=sys.stderr)
                tracks.append({
                    'language': lang_code,
                    'name': f'{lang_code} (YTA)',
                    'url': '',
                    'local_path': yta_path,
                    'ext': 'vtt',
                    'is_auto': transcript.is_generated,
                })
        except Exception as e:
            print(f"[Subtitle DEBUG] YTA download failed: {e}", file=sys.stderr)

        # ── Download 2: TimedText native VTT ──
        timedtext_path = None
        try:
            # transcript._url is the internal timedtext signature URL
            tts_url = f"{transcript._url}&fmt=vtt"
            import urllib.request
            req = urllib.request.Request(tts_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw = resp.read().decode('utf-8', errors='replace')
            if raw.strip().startswith('WEBVTT'):
                # Patch alignment: center + bottom
                fixed = (raw
                         .replace('align:start position:0%', 'align:center position:50%')
                         .replace('align:start', 'align:center'))
                fixed = _re.sub(r'<[^>]+>', '', fixed)
                tt_filename = f"sub_{video_id}_{lang_code}_{source_tag}_timedtext.vtt"
                timedtext_path = os.path.join(cache_dir, tt_filename)
                with open(timedtext_path, 'w', encoding='utf-8') as f:
                    f.write(fixed)
                print(f"[Subtitle DEBUG] TimedText VTT saved: {timedtext_path}", file=sys.stderr)
                tracks.append({
                    'language': lang_code,
                    'name': f'{lang_code} (TimedText)',
                    'url': tts_url,
                    'local_path': timedtext_path,
                    'ext': 'vtt',
                    'is_auto': transcript.is_generated,
                })
            else:
                print(f"[Subtitle DEBUG] TimedText not VTT (starts with: {raw.strip()[:40]}...)", file=sys.stderr)
        except Exception as e:
            print(f"[Subtitle DEBUG] TimedText download failed: {e}", file=sys.stderr)

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

def download_video(video_id: str, max_height: int = 1080, ffmpeg_location: str = "", subtitle_mode: str = "auto") -> str:
    """用 yt-dlp 下載 bestvideo+bestaudio 並用 ffmpeg 合併成 MP4 檔案，
    同時提取 timedtext 字幕並緩存為 VTT，回傳 JSON 字符串。

    subtitle_mode:
      - "auto":   YTA 優先 → timedtext fallback（字幕自動偵測）
      - "none":   timedtext 優先 → YTA fallback（指定解析度時使用）

    所有模式：先下載字幕（看有沒有字幕可下載），再處理影片。
    """
    import yt_dlp
    import os
    import tempfile
    import json

    cache_dir = os.path.join(tempfile.gettempdir(), 'NoadYT-Desktop', 'downloads')
    os.makedirs(cache_dir, exist_ok=True)

    out_path = os.path.join(cache_dir, f"{video_id}.mp4")

    # 步驟 1：先下載字幕（所有模式都執行，使用 subtitle_mode 作為語言偏好獲取字幕）
    subtitles_tracks = []
    try:
        info = _extractor.extract_video_info(video_id, subtitle_mode)  # 使用用戶選擇的語言偏好
        info_dict = json.loads(info) if isinstance(info, str) else info
        for tr in info_dict.get('subtitles', []):
            src = tr.get('local_path')
            if not src or not os.path.exists(src):
                continue
            # 按優先級排序：TimedText 優先，其次是 YTA
            subtitles_tracks.append({
                'language': tr.get('language', ''),
                'name': tr.get('name', tr.get('language', '')),
                'path': src,
                'priority': 0 if 'TimedText' in tr.get('name', '') else 1,
            })
        # 按優先級排序：TimedText (0) 在前，YTA (1) 在後
        subtitles_tracks.sort(key=lambda tr: tr['priority'])
        # 複製最高優先級的字幕為 {video_id}.vtt（與影片同名，方便 Rust 端掃描）
        if subtitles_tracks:
            best = subtitles_tracks[0]
            match_name = f"{video_id}.vtt"
            match_path = os.path.join(cache_dir, match_name)
            try:
                import shutil
                if os.path.abspath(best['path']) != os.path.abspath(match_path):
                    shutil.copy2(best['path'], match_path)
            except Exception as copy_err:
                logger.warning(f"[DownloadVideo] 複製字幕到 match 路徑失敗: {copy_err}")
                match_path = best['path']
            subtitles_tracks = [{
                'language': best['language'],
                'name': best['name'],
                'path': match_path,
            }]
        logger.info(f"[DownloadVideo] 字幕軌道數: {len(subtitles_tracks)} (優先級: {subtitles_tracks[0]['name'] if subtitles_tracks else '無'})")
    except Exception as e:
        logger.warning(f"[DownloadVideo] 字幕下載失敗（繼續處理影片）: {e}")

    # 步驟 2：若已下載過影片，直接回傳路徑
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        logger.info(f"[DownloadVideo] 已存在: {out_path}")
        return json.dumps({"ok": True, "path": out_path, "subtitles": subtitles_tracks}, ensure_ascii=False)

    opts = {
        'quiet': True,
        'no_warnings': True,
        'format': f'bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best',
        'merge_output_format': 'mp4',
        'outtmpl': os.path.join(cache_dir, f"{video_id}.%(ext)s"),
        'js_runtimes': {'node': {}},
        'remote_components': 'ejs:github',
    }

    if ffmpeg_location:
        opts['ffmpeg_location'] = ffmpeg_location

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])

        # 尋找下載後的 MP4 檔案
        for f in os.listdir(cache_dir):
            if f.startswith(video_id) and f.endswith('.mp4'):
                full = os.path.join(cache_dir, f)
                logger.info(f"[DownloadVideo] 下載完成: {full}")
                return json.dumps({"ok": True, "path": full, "subtitles": subtitles_tracks}, ensure_ascii=False)

        logger.error(f"[DownloadVideo] 找不到下載後的 MP4 檔案: {cache_dir}")
        return json.dumps({"ok": False, "error": "找不到下載後的 MP4 檔案"}, ensure_ascii=False)
    except Exception as e:
        logger.error(f"[DownloadVideo] 下載失敗: {e}")
        return json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)

# 全局狀態：記錄最近一次目標影片 ID（供 web client fallback 使用）
_last_target_video_id = ""

# ═══════════════════════════════════════════════════════════
# 頻道搜尋模組（_channel_search.py 獨立邏輯，不影響影片搜尋）
# ═══════════════════════════════════════════════════════════

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


# ═════════════════════════════════════════════════════════════════
# Windows Sidecar CLI entry (Tauri Rust 呼叫此腳本，讀取 stdout JSON)
# ═════════════════════════════════════════════════════════════════
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
        _emit({"error": "usage: python youtube_extractor.py --search <keyword> | --info <video_id> [lang] | --playlist <id> | --channels <keyword> | --download <video_id> [max_height]"})
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        if cmd == "--search" and len(sys.argv) >= 3:
            _emit(json.loads(search_videos(sys.argv[2])))
        elif cmd == "--info" and len(sys.argv) >= 3:
            pref = sys.argv[3] if len(sys.argv) >= 4 else "none"
            _emit(json.loads(get_video_info(sys.argv[2], pref)))
        elif cmd == "--playlist" and len(sys.argv) >= 3:
            _emit(json.loads(get_playlist_videos(sys.argv[2])))
        elif cmd == "--channels" and len(sys.argv) >= 3:
            _emit(json.loads(search_channels(sys.argv[2])))
        elif cmd == "--download" and len(sys.argv) >= 3:
            max_h = int(sys.argv[3]) if len(sys.argv) >= 4 else 1080
            ffmpeg_loc = sys.argv[4] if len(sys.argv) >= 5 else ""
            subtitle_mode = sys.argv[5] if len(sys.argv) >= 6 else "auto"
            result = download_video(sys.argv[2], max_h, ffmpeg_loc, subtitle_mode)
            # download_video 已經回傳 JSON 字符串，解析後 emit
            try:
                _emit(json.loads(result))
            except Exception:
                _emit({"ok": False, "error": result})
        else:
            _emit({"error": "unknown command or missing argument"})
            sys.exit(1)
    except Exception as e:
        _emit({"error": str(e)})
        sys.exit(1)