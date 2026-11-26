import sys

with open('src/main.rs', 'rb') as f:
    content = f.read()

# Find get_stream_url function
start_marker = b'fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {'
start = content.find(start_marker)
if start == -1:
    print('get_stream_url not found')
    exit(1)

# Find matching closing brace by counting braces
brace_count = 0
func_end = -1
for i in range(start, len(content)):
    if content[i:i+1] == b'{':
        brace_count += 1
    elif content[i:i+1] == b'}':
        brace_count -= 1
        if brace_count == 0:
            func_end = i + 1
            break

if func_end == -1:
    print('ERROR: Could not find end of function')
    exit(1)

print(f'get_stream_url spans from {start} to {func_end}')

# New get_stream_url function as bytes (all ASCII)
new_get_stream_url = b'''#[command]
fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {
    dlog!("[DEBUG get_stream_url] START video_id={} resolution={:?} player_type={:?}", input.video_id, input.resolution, input.player_type);

    // 解析 resolution
    let max_h = match input.resolution.as_deref() {
        None | Some("auto") => 1080u64,
        Some(h) => h.parse::<u64>().unwrap_or(1080),
    };

    // 判断是否为外部播放器模式
    let is_external = input.player_type.as_deref() == Some("external");

    // 获取 ffmpeg 路径（与 exe 同目录的 resources/ffmpeg/ffmpeg.exe，MSI 打包后会随程序一起安装）
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("failed to get current exe path: {}", e))?;
    let dir = exe_path.parent().ok_or("failed to get exe parent directory")?;
    let ffmpeg_path = dir.join("resources").join("ffmpeg").join("ffmpeg.exe");
    let ffmpeg_str = ffmpeg_path.to_str().unwrap_or("");

    // 步骤 1：决定 subtitle_mode（Python 端用来控制字幕语言偏好）
    //   用户选择的语言代码（auto, en, zh-Hans, zh-Hant, ja, es, de, fr）
    let subtitle_mode = input.subtitle_lang.as_deref().unwrap_or("auto");

    // === 步骤 2：先获取串流资讯（参考 NoadYTTV 的 getBestPlaybackInfo 逻辑）===
    let stream_info = match try_stream_url_full(&input.video_id, subtitle_mode) {
        Ok(info) => info,
        Err(e) => {
            dlog!("[DEBUG get_stream_url] Stream failed: {}, falling back to download", e);
            // 串流完全失败，直接下载
            return try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode);
        }
    };

    // === 步骤 3：根据播放器类型选择最佳轨迹 ===
    if is_external {
        // 外部播放器：直接传递串流 URL（视频 + 音频），让播放器自己处理
        // 优先 DASH video（高解析度）+ DASH audio
        // 次选：Combined（单一文件，PotPlayer 可直接播放）
        // 最后：Download（带字幕，最稳定）
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                // 直接传递两个 URL 给外部播放器，不下载音频到本地
                dlog!("[DEBUG get_stream_url] External: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                });
            }
        }
        // 没有 DASH 分离轨迹，尝试 Combined（单一文件，PotPlayer 可直接播放）
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] External: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
            });
        }
        // 没有合适的串流，fallback 到 Download
        dlog!("[DEBUG get_stream_url] External: No suitable stream, trying download...");
        try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode)
    } else {
        // 内部播放器：Stream 优先（高品質、即时播放），失败再 fallback 到 Download（带字幕）
        // 优先 Combined > DASH video+audio > manifest
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] Internal: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
            });
        }
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                dlog!("[DEBUG get_stream_url] Internal: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                });
            }
        }
        if let Some(man_url) = &stream_info.manifest_url {
            dlog!("[DEBUG get_stream_url] Internal: SELECTED manifest");
            return Ok(StreamResult {
                path: man_url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
            });
        }
        // 都失败，fallback 到 Download（带字幕）
        dlog!("[DEBUG get_stream_url] Internal: No suitable stream, trying download...");
        try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode)
    }
}
'''

# Replace the function
new_content = content[:start] + new_get_stream_url + content[func_end:]

with open('src/main.rs', 'wb') as f:
    f.write(new_content)

print('Success: replaced get_stream_url function')
