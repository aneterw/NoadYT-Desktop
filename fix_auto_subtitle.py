path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\python\youtube_extractor.py'
content = open(path, 'r', encoding='utf-8').read()

# 替換 extract_video_info 的 _extract_subtitles 邏輯中的 auto mode
old_auto = '''        # ── Auto mode ──
        if preferred_lang == "auto":
            # Step A: YTA 主動下載字幕 — 獲取可用語言，直接下載第一個可用語言
            try:
                from youtube_transcript_api import YouTubeTranscriptApi
                yta = YouTubeTranscriptApi()
                transcript_list = yta.list(video_id)  # 獲取所有可用轉錄
                available = list(transcript_list)
                if available:
                    chosen = available[0]  # 第一個可用語言，不按優先順序
                    detected_lang = chosen.language_code
                    result = chosen.fetch()  # 下載該語言字幕
                    entries = result.to_raw_data()  # 新版 API: FetchedTranscript → list of dict
                    if entries:
                        vtt_content = self._build_vtt_from_entries(entries, detected_lang)
                        if vtt_content:
                            vtt_path = os.path.join(self._get_cache_dir(), f"sub_auto_{video_id}_{detected_lang}.vtt")
                            with open(vtt_path, 'w', encoding='utf-8-sig') as f:
                                f.write(vtt_content)
                            tracks.append({
                                'language': detected_lang,
                                'name': f"{detected_lang} (YTA)",
                                'url': '',
                                'local_path': vtt_path,
                                'ext': 'vtt',
                                'is_auto': True,
                            })
                            logger.info(f"[Subtitle] YTA HIT [{detected_lang}] for [{video_id}] path={vtt_path}")
                            return tracks
            except Exception as e:
                logger.warning(f"[Subtitle] YTA direct download failed: {e}")

            # Step B: YTA 全部失敗，fallback 到 timedtext 按優先順序 [en, ja]
            if not tracks:
                for fb in ['en', 'ja']:
                    for lang, subs in all_captions.items():
                        if _matches(lang, fb):
                            _add_timedtext(lang, subs, is_auto_src=lang in (auto_captions or {}), video_id=video_id)
                            if tracks:
                                return tracks'''

new_auto = '''        # ── Auto mode ──
        if preferred_lang == "auto":
            detected_lang = None
            yta_vtt_path = None
            # Step A: YTA 主動下載字幕 — 獲取可用語言，直接下載第一個可用語言
            try:
                from youtube_transcript_api import YouTubeTranscriptApi
                yta = YouTubeTranscriptApi()
                transcript_list = yta.list(video_id)  # 獲取所有可用轉錄
                available = list(transcript_list)
                if available:
                    chosen = available[0]  # 第一個可用語言，不按優先順序
                    detected_lang = chosen.language_code
                    result = chosen.fetch()  # 下載該語言字幕
                    entries = result.to_raw_data()  # 新版 API: FetchedTranscript → list of dict
                    if entries:
                        vtt_content = self._build_vtt_from_entries(entries, detected_lang)
                        if vtt_content:
                            yta_vtt_path = os.path.join(self._get_cache_dir(), f"sub_auto_{video_id}_{detected_lang}.vtt")
                            with open(yta_vtt_path, 'w', encoding='utf-8-sig') as f:
                                f.write(vtt_content)
                            tracks.append({
                                'language': detected_lang,
                                'name': f"{detected_lang} (YTA)",
                                'url': '',
                                'local_path': yta_vtt_path,
                                'ext': 'vtt',
                                'is_auto': True,
                            })
                            logger.info(f"[Subtitle] YTA HIT [{detected_lang}] for [{video_id}] path={yta_vtt_path}")
            except Exception as e:
                logger.warning(f"[Subtitle] YTA direct download failed: {e}")

            # Step B: YTA 成功後，用偵測到的語言去抓 timedtext；如果 timedtext 有，優先用 timedtext（替換 YTA）
            if detected_lang:
                for lang, subs in all_captions.items():
                    if _matches(lang, detected_lang):
                        _add_timedtext(lang, subs, is_auto_src=lang in (auto_captions or {}), video_id=video_id)
                        if tracks:
                            # 如果 timedtext 成功，移除 YTA 軌道，只保留 timedtext
                            tracks = [t for t in tracks if not t.get('name', '').endswith('(YTA)')]
                            logger.info(f"[Subtitle] Auto mode: using timedtext [{lang}] over YTA")
                            return tracks

            # Step C: 如果 timedtext 沒有該語言，回傳 YTA 字幕（如果有的話）
            if tracks:
                return tracks

            # Step D: YTA 也失敗，fallback 到 timedtext 按優先順序 [en, ja]
            if not tracks:
                for fb in ['en', 'ja']:
                    for lang, subs in all_captions.items():
                        if _matches(lang, fb):
                            _add_timedtext(lang, subs, is_auto_src=lang in (auto_captions or {}), video_id=video_id)
                            if tracks:
                                return tracks'''

content = content.replace(old_auto, new_auto)

open(path, 'w', encoding='utf-8').write(content)
print('Python auto mode subtitle logic updated')