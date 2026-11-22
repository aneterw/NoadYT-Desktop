path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src-tauri\src\main.rs'
content = open(path, 'r', encoding='utf-8').read()

# Find and replace the broken get_stream_url function
old = '''#[command]
fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {
    // 決策：
    //   auto   → 串流 優先（YTA 字幕 → timedtext fallback），download+ffmpeg fallback（帶字幕）
        //   指定   → 串流 優先（無字幕），download+ffmpeg fallback（帶字幕）
        // 兩種模式都先嘗試串流，失敗再 fallback 到 download
        // 步驟 1：決定 subtitle_mode（Python 端用來控制字幕抓取順序）
        //   auto   → "auto"   (YTA 優先 → timedtext fallback，優先用 timedtext)
        //   指定   → "none"   (timedtext 優先 → YTA fallback)
        let subtitle_mode = if is_auto { "auto" } else { "none" };

        // 步驟 2：兩種模式都先串流，失敗再 fallback 到 download（帶字幕）
        match try_stream_url(&input.video_id) {
            Ok(result) => return Ok(result),
            Err(e) => eprintln!("[DEBUG get_stream_url] stream failed, will try download: {}", e),
        }
        // 串流失敗，fallback 到 download（帶字幕）
        return try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode);
}'''

new = '''#[command]
fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {
    // 決策：
    //   auto   → 串流 優先（YTA 字幕 → timedtext fallback），download+ffmpeg fallback（帶字幕）
    //   指定   → 串流 優先（無字幕），download+ffmpeg fallback（帶字幕）
    // 兩種模式都先嘗試串流，失敗再 fallback 到 download
    let is_auto = match input.resolution.as_deref() {
        None | Some("auto") => true,
        _ => false,
    };
    let max_h = match input.resolution.as_deref() {
        None | Some("auto") => 1080u64,
        Some(h) => h.parse::<u64>().unwrap_or(1080),
    };

    // 獲取 ffmpeg 路徑（與 exe 同目錄的 resources/ffmpeg/ffmpeg.exe，MSI 打包後會隨程式一起安裝）
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("failed to get current exe path: {}", e))?;
    let dir = exe_path.parent().ok_or("failed to get exe parent directory")?;
    let ffmpeg_path = dir.join("resources").join("ffmpeg").join("ffmpeg.exe");
    let ffmpeg_str = ffmpeg_path.to_str().unwrap_or("");

    // 步驟 1：決定 subtitle_mode（Python 端用來控制字幕抓取順序）
    //   auto   → "auto"   (YTA 優先 → timedtext fallback，優先用 timedtext)
    //   指定   → "none"   (timedtext 優先 → YTA fallback)
    let subtitle_mode = if is_auto { "auto" } else { "none" };

    // 步驟 2：兩種模式都先串流，失敗再 fallback 到 download（帶字幕）
    match try_stream_url(&input.video_id) {
        Ok(result) => return Ok(result),
        Err(e) => eprintln!("[DEBUG get_stream_url] stream failed, will try download: {}", e),
    }
    // 串流失敗，fallback 到 download（帶字幕）
    return try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode);
}'''

content = content.replace(old, new)
open(path, 'w', encoding='utf-8').write(content)
print('Fixed get_stream_url function')