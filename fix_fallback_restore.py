path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\python\youtube_extractor.py'
content = open(path, 'r', encoding='utf-8').read()

old = '''            # Step D: 都失敗，不 fallback，直接返回無字幕
            return tracks'''

new = '''            # Step D: 都失敗，fallback 到 timedtext [en, ja]
            if not tracks:
                for fb in ['en', 'ja']:
                    for lang, subs in all_captions.items():
                        if _matches(lang, fb):
                            _add_timedtext(lang, subs, is_auto_src=lang in (auto_captions or {}), video_id=video_id)
                            if tracks:
                                return tracks
            return tracks'''

content = content.replace(old, new)
open(path, 'w', encoding='utf-8').write(content)
print('Restored timedtext fallback [en, ja]')