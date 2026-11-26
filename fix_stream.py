with open('src-tauri/src/main.rs', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = '''    // === 步驟 3：根據播放器類型選擇最佳軌跡 ===
    if is_external {
        // 外部播放器：優先 DASH video+audio（高解析度），次選 Combined，最後 Download
        dlog!("[DEBUG get_stream_url] External player mode - trying DASH video+audio first...");
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                dlog!("[DEBUG get_stream_url] External: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                });
            }
        }
        // 沒有 DASH 分離軌跡，嘗試 Combined（單一文件，PotPlayer 可直接播放）
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] External: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
            });
        }
        // 沒有合適的串流，fallback 到 Download
        dlog!("[DEBUG get_stream_url] External: No suitable stream, trying download...");
        try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode)
    } else {'''

new_block = '''    // === 步驟 3：根據播放器類型選擇最佳軌跡 ===
    if is_external {
        // 外部播放器：優先 DASH video（串流 URL）+ DASH audio（下載到本地）
        // 次選：Combined（單一文件）
        // 最後：Download（帶字幕，最穩定）
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                // 下載音頻到本地，傳遞視訊串流 URL + 本地音頻檔案給播放器
                dlog!("[DEBUG get_stream_url] External: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                match try_download_audio_only(a_url, &input.video_id) {
                    Ok(audio_path) => {
                        return Ok(StreamResult {
                            path: v_url.clone(),
                            audio_url: Some(audio_path),
                            subtitles: stream_info.subtitles.clone(),
                        });
                    }
                    Err(e) => dlog!("[DEBUG get_stream_url] External: DASH audio download failed: {}", e),
                }
            }
        }
        // 沒有 DASH 分離軌跡，嘗試 Combined（單一文件，PotPlayer 可直接播放）
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] External: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
            });
        }
        // 沒有合適的串流，fallback 到 Download
        dlog!("[DEBUG get_stream_url] External: No suitable stream, trying download...");
        try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode)
    } else {'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src-tauri/src/main.rs', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success: replaced external player section')
else:
    print('Could not find old text')
    # Debug: show what we have around line 380-410
    lines = content.split('\\n')
    for i, line in enumerate(lines[379:407], start=380):
        print(f'{i}: {repr(line)}')
EOF