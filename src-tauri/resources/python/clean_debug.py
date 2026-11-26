content = open('youtube_extractor.py', 'r', encoding='utf-8').read()

# 1. _filter_formats 裡的詳細 RAW format 列印（移除每個格式的 debug）
old1 = '''        print(f"[DEBUG] Raw formats from yt-dlp: {len(formats)} total", file=sys.stderr)
        # 詳細列出所有原始格式
        for f in formats:
            proto = f.get('protocol', '')
            url = f.get('url')
            manifest = f.get('manifest_url')
            print(f"[DEBUG]   RAW fmt={f.get('format_id')} h={f.get('height')} tbr={f.get('tbr')} vcodec={f.get('vcodec')} acodec={f.get('acodec')} proto={proto} url_len={len(str(url)) if url else 0} manifest_url={bool(manifest)}", file=sys.stderr)
        filtered = []'''
new1 = '''        print(f"[DEBUG] Raw formats from yt-dlp: {len(formats)} total", file=sys.stderr)
        filtered = []'''
content = content.replace(old1, new1, 1)

# 2. Filtered formats 的詳細列印（只保留數量摘要）
old2 = '''        # Sort by quality (height descending)
        filtered.sort(key=lambda x: x.get('height') or 0, reverse=True)
        print(f"[DEBUG] Filtered formats: {len(filtered)} (protocols: {[f['protocol'] for f in filtered][:5]}...)", file=sys.stderr)
        for f in filtered[:10]:
            print(f"[DEBUG]   fmt={f['format_id']} h={f['height']} tbr={f['tbr']} vcodec={f['vcodec']} proto={f['protocol']} manifest={bool(f.get('manifest_url'))}", file=sys.stderr)
        return filtered'''
new2 = '''        # Sort by quality (height descending)
        filtered.sort(key=lambda x: x.get('height') or 0, reverse=True)
        print(f"[DEBUG] Filtered formats: {len(filtered)} total", file=sys.stderr)
        return filtered'''
content = content.replace(old2, new2, 1)

# 3. _extract_subtitles 裡的詳細 debug print
# 3a: 可用語言列表
old3 = '''        available_codes = [t.language_code for t in transcript_list]
        print(f"[Subtitle DEBUG] Available caption languages: {available_codes}", file=sys.stderr)

        if not available_codes:
            print(f"[Subtitle DEBUG] No subtitle tracks available for {video_id}", file=sys.stderr)
            return tracks'''
new3 = '''        available_codes = [t.language_code for t in transcript_list]

        if not available_codes:
            print(f"[Subtitle DEBUG] No subtitle tracks available for {video_id}", file=sys.stderr)
            return tracks'''
content = content.replace(old3, new3, 1)

# 3b: auto 模式與具體語言選擇
old4 = '''        if preferred_lang == "auto":
            target_langs = available_codes[:1]
            print(f"[Subtitle DEBUG] Auto mode: using first available language: {target_langs}", file=sys.stderr)
        else:
            # Specific language: try preferred first, fallback to first available
            target_langs = [lang for lang in [preferred_lang] if lang in available_codes]
            if not target_langs:
                target_langs = available_codes[:1]
                print(f"[Subtitle DEBUG] Preferred lang '{preferred_lang}' not available, using: {target_langs}", file=sys.stderr)
            else:
                print(f"[Subtitle DEBUG] Using preferred language: {target_langs}", file=sys.stderr)'''
new4 = '''        if preferred_lang == "auto":
            target_langs = available_codes[:1]
        else:
            # Specific language: try preferred first, fallback to first available
            target_langs = [lang for lang in [preferred_lang] if lang in available_codes]
            if not target_langs:
                target_langs = available_codes[:1]'''
content = content.replace(old4, new4, 1)

# 3c: Target 語言
old5 = '''            target_lang_code = transcript.language_code
            target_source_tag = "manual" if not transcript.is_generated else "auto"
            print(f"[Subtitle DEBUG] Target: {transcript.language} ({target_lang_code}) | {target_source_tag.upper()}", file=sys.stderr)'''
new5 = '''            target_lang_code = transcript.language_code
            target_source_tag = "manual" if not transcript.is_generated else "auto"'''
content = content.replace(old5, new5, 1)

# 3d: YTA VTT saved
old6 = '''                    print(f"[Subtitle DEBUG] YTA VTT saved: {yta_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "YTA", yta_path, transcript.is_generated))'''
new6 = '''                    tracks.append(_make_track(lang_code, source_tag, "YTA", yta_path, transcript.is_generated))'''
content = content.replace(old6, new6, 1)

# 3e: YTA download failed + JSON3 fallback
old7 = '''            except Exception as e:
                print(f"[Subtitle DEBUG] YTA download failed: {e}", file=sys.stderr)
                # Fallback to JSON3 method (bypasses YTA API limitation)
                print(f"[Subtitle DEBUG] Trying JSON3 fallback for {lang_code}...", file=sys.stderr)
                json3_path = self._fetch_yta_json3(lang_code)
                if json3_path and os.path.exists(json3_path):
                    print(f"[Subtitle DEBUG] JSON3 VTT saved: {json3_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "YTA(JSON3)", json3_path, transcript.is_generated))'''
new7 = '''            except Exception as e:
                # Fallback to JSON3 method (bypasses YTA API limitation)
                json3_path = self._fetch_yta_json3(lang_code)
                if json3_path and os.path.exists(json3_path):
                    tracks.append(_make_track(lang_code, source_tag, "YTA(JSON3)", json3_path, transcript.is_generated))'''
content = content.replace(old7, new7, 1)

# 3f: Trying timedtext
old8 = '''            print(f"[Subtitle DEBUG] Trying timedtext for {lang_code}...", file=sys.stderr)
            try:'''
new8 = '''            try:'''
content = content.replace(old8, new8, 1)

# 3g: TimedText VTT saved / not VTT / failed
old9 = '''                    print(f"[Subtitle DEBUG] TimedText VTT saved: {timedtext_path}", file=sys.stderr)
                    tracks.append(_make_track(lang_code, source_tag, "TimedText", timedtext_path, transcript.is_generated))
                else:
                    print(f"[Subtitle DEBUG] TimedText not VTT (starts with: {raw.strip()[:40]}...)", file=sys.stderr)
            except Exception as e:
                print(f"[Subtitle DEBUG] TimedText download failed: {e}", file=sys.stderr)'''
new9 = '''                    tracks.append(_make_track(lang_code, source_tag, "TimedText", timedtext_path, transcript.is_generated))
                else:
                    print(f"[Subtitle DEBUG] TimedText not VTT", file=sys.stderr)
            except Exception as e:
                pass'''
content = content.replace(old9, new9, 1)

# 3h: EN fallback debug
old10 = '''                    if 'en' in available_codes:
                        print("[Subtitle DEBUG] No target subtitles, trying en fallback...", file=sys.stderr)
                        try:
                            en_transcript = transcript_list.find_transcript(['en'])
                            en_lang = en_transcript.language_code
                            en_source = "manual" if not en_transcript.is_generated else "auto"
                            print(f"[Subtitle DEBUG] EN fallback: {en_transcript.language} ({en_lang}) | {en_source.upper()}", file=sys.stderr)'''
new10 = '''                    if 'en' in available_codes:
                        try:
                            en_transcript = transcript_list.find_transcript(['en'])
                            en_lang = en_transcript.language_code
                            en_source = "manual" if not en_transcript.is_generated else "auto"'''
content = content.replace(old10, new10, 1)

# 3i: EN YTA saved / failed
old11 = '''                            print(f"[Subtitle DEBUG] EN YTA VTT saved: {fp}", file=sys.stderr)
                            tracks.append(_make_track(en_lang, en_source, "YTA", fp, en_transcript.is_generated))
                            en_yta_ok = True
                    except Exception as e:
                        print(f"[Subtitle DEBUG] EN YTA failed: {e}", file=sys.stderr)'''
new11 = '''                            tracks.append(_make_track(en_lang, en_source, "YTA", fp, en_transcript.is_generated))
                            en_yta_ok = True
                    except Exception as e:
                        pass'''
content = content.replace(old11, new11, 1)

# 3j: EN TimedText saved / not VTT / failed
old12 = '''                                print(f"[Subtitle DEBUG] EN TimedText VTT saved: {fp}", file=sys.stderr)
                                tracks.append(_make_track(en_lang, en_source, "TimedText", fp, en_transcript.is_generated))
                            else:
                                print("[Subtitle DEBUG] EN TimedText not VTT", file=sys.stderr)
                        except Exception as e:
                            print(f"[Subtitle DEBUG] EN TimedText failed: {e}", file=sys.stderr)'''
new12 = '''                                tracks.append(_make_track(en_lang, en_source, "TimedText", fp, en_transcript.is_generated))
                            else:
                                pass
                        except Exception as e:
                            pass'''
content = content.replace(old12, new12, 1)

# 3k: EN fallback failed
old13 = '''                except Exception as e:
                    print(f"[Subtitle DEBUG] EN fallback failed: {e}", file=sys.stderr)'''
new13 = '''                except Exception as e:
                    pass'''
content = content.replace(old13, new13, 1)

open('youtube_extractor.py', 'w', encoding='utf-8').write(content)
print('Done')
