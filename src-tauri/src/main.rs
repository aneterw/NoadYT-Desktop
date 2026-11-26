#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::env;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::command;
use tauri::Builder;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn log_to_file(msg: &str) {
    let log_path = std::path::Path::new(r"C:\Users\Aneter-MiniPC\NoadYT-Desktop\app.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] {}", timestamp, msg);
    }
}

macro_rules! dlog {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("{}", msg);
        log_to_file(&msg);
    }};
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchVideosInput {
    keyword: String,
    maxResults: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchVideosOutput {
    ok: bool,
    data: serde_json::Value,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchVideosResult {
    ok: bool,
    data: Vec<serde_json::Value>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamResult {
    path: String,
    audio_url: Option<String>,
    subtitles: Vec<SubtitleTrack>,
    /// 串流所需的 User-Agent（YouTube DASH 串流需要，否則 403/黑屏；下載檔案為 None）
    user_agent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamInfo {
    best_combined: Option<(u64, String)>,
    best_dash_video: Option<(u64, String)>,
    best_dash_audio: Option<(u64, String)>,
    manifest_url: Option<String>,
    subtitles: Vec<SubtitleTrack>,
    /// 串流 URL 所需的 User-Agent（取自 formats[].http_headers，YouTube 防 403）
    user_agent: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SubtitleTrack {
    language: String,
    name: String,
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetStreamUrlInput {
    video_id: String,
    resolution: Option<String>,
    subtitle_lang: Option<String>,
    player_type: Option<String>,
}

#[command]
fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {
    dlog!("[DEBUG get_stream_url] START video_id={} resolution={:?} player_type={:?}", input.video_id, input.resolution, input.player_type);

    // 解析 resolution：auto = 不設上限（取最高品質）
    let max_h = match input.resolution.as_deref() {
        None | Some("auto") => u64::MAX,
        Some(h) => h.parse::<u64>().unwrap_or(u64::MAX),
    };

    // 判断是否为外部播放器模式
    let is_external = input.player_type.as_deref() == Some("external");

    // 步骤 1：決定 subtitle_mode（Python 端用來控制字幕語言偏好）
    let subtitle_mode = input.subtitle_lang.as_deref().unwrap_or("auto");

    // === 步驟 2：獲取串流資訊（純串流，不做 download） ===
    let stream_info = try_stream_url_full(&input.video_id, subtitle_mode, max_h)
        .map_err(|e| format!("無法取得串流: {}", e))?;

    // === 步驟 3：根據播放器類型選擇最佳軌跡（純串流，無 download fallback） ===
    if is_external {
        // 外部播放器：直接傳遞串流 URL（視訊 + 音訊），讓播放器自己處理合併
        // 優先 DASH video（高解析度）+ DASH audio，次选 Combined
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                // 直接傳遞兩個 URL 給外部播放器，不下載音頻到本地
                dlog!("[DEBUG get_stream_url] External: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                    user_agent: stream_info.user_agent.clone(),
                });
            }
        }
        // 沒有 DASH 分離軌跡，尝试 Combined（單一文件）
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] External: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
                user_agent: stream_info.user_agent.clone(),
            });
        }
        Err(format!(
            "沒有可用的串流軌道（解析度上限 {}），請換一台影片或提高解析度上限",
            input.resolution.as_deref().unwrap_or("auto")
        ))
    } else {
        // 内部播放器：DASH video + audio 優先（可選高畫質），其次 Combined
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                dlog!("[DEBUG get_stream_url] Internal: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                    user_agent: stream_info.user_agent.clone(),
                });
            }
        }
        if let Some((h, url)) = &stream_info.best_combined {
            dlog!("[DEBUG get_stream_url] Internal: SELECTED COMBINED h={}p", h);
            return Ok(StreamResult {
                path: url.clone(),
                audio_url: None,
                subtitles: stream_info.subtitles.clone(),
                user_agent: stream_info.user_agent.clone(),
            });
        }
        Err(format!(
            "沒有可用的串流軌道（解析度上限 {}），請換一台影片或提高解析度上限",
            input.resolution.as_deref().unwrap_or("auto")
        ))
    }
}

/// 步骤 2：串流分析（参考 NoadYTTV 的 getBestPlaybackInfo 逻辑）
/// 收集所有軌跡：Combined、DASH-video、DASH-audio、manifest（依 max_h 過濾）
fn try_stream_url_full(video_id: &str, subtitle_mode: &str, max_h: u64) -> Result<StreamInfo, String> {
    dlog!("[DEBUG try_stream_url_full] START video_id={}", video_id);
    let json = run_extractor(&["--info", video_id, subtitle_mode])?;
    dlog!("[DEBUG try_stream_url_full] run_extractor OK, json_len={}", json.len());

    let info = match extract_json_from_stdout(&json) {
        Some(v) => v,
        None => return Err("no JSON in stream response".to_string()),
    };

    let formats = info.get("formats").and_then(|v| v.as_array()).ok_or("no formats array")?;
    dlog!("[DEBUG try_stream_url_full] total formats: {}", formats.len());

    // 字幕軌跡
    let mut subtitles: Vec<SubtitleTrack> = Vec::new();
    if let Some(subs_arr) = info.get("subtitles").and_then(|v| v.as_array()) {
        for sub in subs_arr {
            let language = sub.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let sub_path = sub.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            // 轉換為 Windows 本地路徑（外部播放器需要本地路徑，不是 file:/// URL）
            let sub_path = sub_path.strip_prefix("file:///").unwrap_or(&sub_path).to_string().replace('/', "\\");
            if !sub_path.is_empty() {
                dlog!("[DEBUG try_stream_url_full] Found subtitle: {} - {}", language, sub_path);
                subtitles.push(SubtitleTrack { language, name, path: sub_path });
            }
        }
    }
    dlog!("[DEBUG try_stream_url_full] Total subtitle tracks: {}", subtitles.len());

    // 收集所有軌跡
    let mut best_combined: Option<(u64, String)> = None;      // 有聲有影（Combined）
    let mut best_dash_video: Option<(u64, String)> = None;   // 純視訊（DASH）
    let mut best_dash_audio: Option<(u64, String)> = None;   // 純音頻（DASH）
    let mut manifest_url: Option<String> = None;
    let mut user_agent: Option<String> = None;                // 串流 URL 所需的 User-Agent（YouTube 防 403）

    for f in formats.iter() {
        let vcodec = f.get("vcodec").and_then(|v| v.as_str()).unwrap_or("");
        let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("");
        let url = f.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let m_url = f.get("manifest_url").and_then(|v| v.as_str()).unwrap_or("");
        let height = f.get("height").and_then(|v| v.as_u64()).unwrap_or(0);

        if url.is_empty() && m_url.is_empty() { continue; }

        // 解析度上限：含影片的軌道（combined / dash video / manifest）不超過 max_h
        // 純音訊軌（vcodec=none）不受高度限制
        let has_video = !vcodec.is_empty() && vcodec != "none";
        if has_video && height > 0 && height > max_h { continue; }

        // 從 formats[].http_headers 抓 User-Agent（YouTube DASH 串流必備，缺失會 403 黑屏）
        if user_agent.is_none() {
            if let Some(h) = f.get("http_headers") {
                let ua = h.get("User-Agent")
                    .or_else(|| h.get("user-agent"))
                    .and_then(|v| v.as_str());
                if let Some(ua) = ua {
                    if !ua.is_empty() {
                        user_agent = Some(ua.to_string());
                        dlog!("[DEBUG try_stream_url] User-Agent captured: {} (len={})", ua, ua.len());
                    }
                }
            }
        }

        // 記錄 manifest URL
        if !m_url.is_empty() && manifest_url.is_none() {
            manifest_url = Some(m_url.to_string());
        }

        // 收集 Combined（真正有聲有影）軌道 — vcodec 與 acodec 必須同時存在
        // 純音訊軌（vcodec=none）不視為 combined，否則內建播放器會拿到無畫面的 URL 導致黑屏
        if !url.is_empty()
            && !vcodec.is_empty()
            && vcodec != "none"
            && !acodec.is_empty()
            && acodec != "none"
        {
            if let Some((cur_h, _)) = best_combined {
                if height > cur_h {
                    best_combined = Some((height, url.to_string()));
                    dlog!("[DEBUG try_stream_url] >>> NEW BEST COMBINED: h={} vc={} ac={}", height, vcodec, acodec);
                }
            } else {
                best_combined = Some((height, url.to_string()));
                dlog!("[DEBUG try_stream_url] First COMBINED track found: h={} vc={} ac={}", height, vcodec, acodec);
            }
        }

        // 收集 DASH-video（純視訊）軌道
        if !url.is_empty() && (acodec.is_empty() || acodec == "none") {
            if let Some((cur_h, _)) = best_dash_video {
                if height > cur_h {
                    best_dash_video = Some((height, url.to_string()));
                    dlog!("[DEBUG try_stream_url] >>> NEW BEST DASH-video: h={} vc={}", height, vcodec);
                }
            } else {
                best_dash_video = Some((height, url.to_string()));
                dlog!("[DEBUG try_stream_url] First DASH-video track found: h={} vc={}", height, vcodec);
            }
        }

        // 收集 DASH-audio（純音頻）軌道 — 取最高 abr（音頻 bitrate）
        if !url.is_empty() && (vcodec.is_empty() || vcodec == "none") && !acodec.is_empty() && acodec != "none" {
            let abr = f.get("abr").and_then(|v| v.as_u64()).unwrap_or(0);
            if let Some((cur_ab, _)) = best_dash_audio {
                if abr > cur_ab {
                    best_dash_audio = Some((abr, url.to_string()));
                    dlog!("[DEBUG try_stream_url] >>> NEW BEST DASH-audio: abr={}kbit", abr);
                }
            } else {
                best_dash_audio = Some((abr, url.to_string()));
                dlog!("[DEBUG try_stream_url] First DASH-audio track found: abr={}kbit", abr);
            }
        }
    }

    dlog!("[DEBUG try_stream_url_full] Combined: {:?}, DASH-video: {:?}, DASH-audio: {:?}, manifest: {:?}, user_agent: {:?}",
        best_combined.as_ref().map(|(h,_)| *h), best_dash_video.as_ref().map(|(h,_)| *h), best_dash_audio.is_some(), manifest_url.is_some(), user_agent.as_deref());

    Ok(StreamInfo {
        best_combined,
        best_dash_video,
        best_dash_audio,
        manifest_url,
        subtitles,
        user_agent,
    })
}


/// 启动外部播放器
#[command]
fn play_with_external_player(video_path: String, audio_url: Option<String>, subtitle_paths: Vec<String>, player: String) -> Result<String, String> {
    use std::process::Command;

    dlog!("[DEBUG play_with_external_player] START player={} video_path={} audio_url={:?} subtitle_count={}", player, video_path, audio_url, subtitle_paths.len());

    // 根據播放器類型尋找對應的可執行檔路徑
    let exe = match player.as_str() {
        "mpv" => find_player_exe("mpv", &[
            r"C:\Program Files\mpv\mpv.exe",
            r"C:\Program Files (x86)\mpv\mpv.exe",
            "mpv.exe",
            "mpv",
        ]),
        "potplayer" => find_player_exe("potplayer", &[
            r"C:\Program Files\DAUM\PotPlayer\PotPlayer.exe",
            r"C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe",
            r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayer.exe",
            r"C:\Program Files (x86)\DAUM\PotPlayer\PotPlayerMini64.exe",
            "PotPlayer.exe",
            "PotPlayerMini64.exe",
        ]),
        "vlc" => find_player_exe("vlc", &[
            r"C:\Program Files\VideoLAN\VLC\vlc.exe",
            r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
            "vlc.exe",
        ]),
        _ => return Err(format!("不支援的播放器: {}", player)),
    };

    let exe = exe.ok_or_else(|| format!("找不到 {} 播放器，請先安裝", player))?;
    dlog!("[DEBUG play_with_external_player] player={}, exe={}, video_path={}", player, exe, video_path);
    for (i, sub) in subtitle_paths.iter().enumerate() {
        dlog!("[DEBUG play_with_external_player] subtitle[{}]: {}", i, sub);
    }

    // 檢查影片檔案是否存在（僅限本地檔案，遠端 URL 不檢查）
    let is_remote_url = video_path.starts_with("http://") || video_path.starts_with("https://");
    if !is_remote_url && !Path::new(&video_path).exists() {
        dlog!("[DEBUG play_with_external_player] ERROR: video file not found: {}", video_path);
        return Err(format!("影片檔案不存在: {}", video_path));
    }
    dlog!("[DEBUG play_with_external_player] video file/URL OK: is_remote={}", is_remote_url);

    let mut cmd = Command::new(&exe);

    // 準備字幕參數
    let subs_args: Vec<String> = if is_remote_url {
        subtitle_paths.clone()
    } else {
        subtitle_paths.iter().map(|s| s.to_string().replace('\\', "/").to_string()).collect()
    };

    // PotPlayer: 影片路徑先加入，字幕用 /sub= 參數
    if player == "potplayer" {
        cmd.arg(&video_path);
        // PotPlayer 命令行不直接支援音訊軌跡，若有音訊 URL，嘗試附加
        if let Some(a) = &audio_url {
            cmd.arg(format!("/audiofile={}", a));
        }
        for sub in &subs_args {
            cmd.arg(format!("/sub={}", sub));
        }
    } else if player == "mpv" || player == "vlc" {
        cmd.arg(&video_path);
        // 音訊軌跡：mpv 用 --audio-file，VLC 用 --input-slave
        if let Some(a) = &audio_url {
            if player == "mpv" {
                cmd.arg("--audio-file").arg(a);
            } else {
                // vlc
                cmd.arg(format!("--input-slave={}", a));
            }
        }
        for sub in &subs_args {
            cmd.arg("--sub-file").arg(sub);
        }
    } else {
        cmd.arg(&video_path);
    }

    // 分離進程，不等待播放器關閉
    dlog!("[DEBUG play_with_external_player] spawning process...");
    cmd.spawn()
        .map_err(|e| format!("無法啟動 {} 播放器: {}", player, e))?;
    dlog!("[DEBUG play_with_external_player] spawn OK");
    Ok(format!("{} 播放器已啟動", player))
}

/// 搜尋影片
#[command]
fn search_videos(input: SearchVideosInput) -> Result<SearchVideosOutput, String> {
    let json = run_extractor(&["--search", &input.keyword, &input.maxResults.unwrap_or(60).to_string()])?;
    let data: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
    Ok(SearchVideosOutput {
        ok: true,
        data,
        error: None,
    })
}

/// 搜尋頻道
#[command]
fn search_channels(input: SearchVideosInput) -> Result<SearchVideosOutput, String> {
    let json = run_extractor(&["--channels", &input.keyword])?;
    let data: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
    Ok(SearchVideosOutput {
        ok: true,
        data,
        error: None,
    })
}

/// 讀取二進制檔案
#[command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&path).map_err(|e| format!("無法讀取檔案: {}", e))
}

/// 清除下載和字幕快取目錄
/// 遇到被其他程序佔用的檔案（os error 32）時跳過，不報錯
#[command]
fn clear_cache() -> Result<bool, String> {
    let temp_dir = env::temp_dir();
    let cache_dirs = vec![
        temp_dir.join("NoadYT-Desktop").join("downloads"),
        temp_dir.join("NoadYT-Desktop").join("subtitles"),
    ];
    let mut skipped = 0usize;
    for dir in &cache_dirs {
        if dir.exists() {
            for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    match std::fs::remove_file(&path) {
                        Ok(_) => {}
                        Err(e) => {
                            // 檔案被佔用時跳過（Windows sharing violation = error 32）
                            if e.raw_os_error() == Some(32) {
                                skipped += 1;
                            } else {
                                return Err(format!("無法刪除 {}: {}", path.display(), e));
                            }
                        }
                    }
                }
            }
        }
    }
    if skipped > 0 {
        dlog!("[DEBUG clear_cache] 有 {} 個檔案被佔用已跳過", skipped);
    }
    Ok(true)
}

/// 執行 Python 提取器
fn run_extractor(args: &[&str]) -> Result<String, String> {
    let py_path = if cfg!(debug_assertions) {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        std::path::Path::new(manifest_dir)
            .parent()
            .ok_or("failed to get parent of manifest dir")?
            .join("python")
            .join("youtube_extractor.py")
    } else {
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("failed to get current exe path: {}", e))?;
        let dir = exe_path.parent().ok_or("failed to get exe parent directory")?;
        dir.join("resources").join("python").join("youtube_extractor.py")
    };

    if !py_path.exists() {
        return Err(format!("Python script not found: {}", py_path.display()));
    }

    let py_exe = find_python_exe()?;

    dlog!("[DEBUG run_extractor] py_exe={:?}, py_path={:?}, args={:?}", py_exe, py_path, args);

    let mut cmd = Command::new(&py_exe);
    cmd.arg(&py_path);
    for arg in args {
        cmd.arg(arg);
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("failed to run python: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    if output.status.success() {
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Python extractor failed: {}", stderr))
    }
}

/// 提取 JSON 從 stdout
fn extract_json_from_stdout(stdout: &str) -> Option<serde_json::Value> {
    serde_json::from_str(stdout).ok()
}

/// 尋找播放器執行檔
fn find_player_exe(_player: &str, paths: &[&str]) -> Option<String> {
    // 優先檢查絕對路徑
    for path in paths {
        let p = Path::new(path);
        if p.exists() {
            return Some(path.to_string());
        }
    }
    // 如果路徑不含分隔符（如 "mpv.exe"），嘗試從 PATH 尋找
    for path in paths {
        if !path.contains('\\') && !path.contains('/') {
            let mut cmd = Command::new(path);
            cmd.arg("--version");
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);
            if cmd.spawn().is_ok() {
                return Some(path.to_string());
            }
        }
    }
    None
}

/// 尋找 Python 執行檔
fn find_python_exe() -> Result<String, String> {
    let possible_paths = [
        r"C:\Users\Aneter-MiniPC\AppData\Local\Programs\Python\Python311\python.exe",
        r"C:\Users\Aneter-MiniPC\AppData\Local\Programs\Python\Python312\python.exe",
        r"C:\Program Files\Python311\python.exe",
        r"C:\Program Files\Python312\python.exe",
        "python.exe",
        "python",
    ];
    for path in &possible_paths {
        let p = Path::new(path);
        if p.exists() {
            return Ok(path.to_string());
        }
        // 如果不含分隔符，嘗試從 PATH 尋找
        if !path.contains('\\') && !path.contains('/') {
            let mut cmd = Command::new(path);
            cmd.arg("--version");
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);
            if cmd.spawn().is_ok() {
                return Ok(path.to_string());
            }
        }
    }
    Err("Python executable not found. Please install Python and add it to PATH.".to_string())
}

/// 播放视频输入参数（用于外部播放器模式）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayVideoInput {
    video_id: String,
    player: String,
    subtitle_lang: String,
    max_resolution: String,
}

/// 启动外部播放器（使用 Python run19.py 完整逻辑）
#[command]
fn play_video_external(input: PlayVideoInput) -> Result<String, String> {
    dlog!("[DEBUG play_video_external] START video_id={} player={} subtitle_lang={} max_res={}",
        input.video_id, input.player, input.subtitle_lang, input.max_resolution);

    let args = vec![
        "--play",
        &input.video_id,
        &input.player,
        &input.subtitle_lang,
        &input.max_resolution,
    ];

    match run_extractor(&args) {
        Ok(_) => Ok(format!("已启动 {} 播放器", input.player)),
        Err(e) => Err(format!("播放失败: {}", e)),
    }
}

/// 播放器偵測結果（前端設定頁顯示）
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DetectPlayersOutput {
    vlc: Option<String>,
    mpv: Option<String>,
}

/// 偵測 VLC / MPV 主程式路徑（供設定頁顯示）
#[command]
fn detect_players() -> DetectPlayersOutput {
    let mpv = find_player_exe("mpv", &[
        r"C:\Program Files\mpv\mpv.exe",
        r"C:\Program Files (x86)\mpv\mpv.exe",
        "mpv.exe",
        "mpv",
    ]);
    let vlc = find_player_exe("vlc", &[
        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
        "vlc.exe",
    ]);
    DetectPlayersOutput { vlc, mpv }
}

/// 以系統預設瀏覽器開啟 URL（設定頁「到 MPV 官網」等導引用）
#[command]
fn open_url(url: String) -> Result<bool, String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map(|_| true)
            .map_err(|e| format!("無法開啟瀏覽器: {}", e))
    }
    #[cfg(not(windows))]
    {
        let _ = &url;
        Ok(false)
    }
}

/// 检查 Python 执行环境
#[command]
fn check_python_environment() -> Result<serde_json::Value, String> {
    let py_exe = find_python_exe();
    match py_exe {
        Ok(path) => {
            let version_output = Command::new(&path)
                .arg("--version")
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            Ok(serde_json::json!({
                "ok": true,
                "python_path": path,
                "version": version_output
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "error": e
        })),
    }
}

/// 写入日志（前端调用）
#[command]
fn write_log(message: String) -> Result<bool, String> {
    log_to_file(&message);
    Ok(true)
}

/// 获取频道视频列表
#[command]
fn get_channel_videos(channel_url: String) -> Result<SearchVideosOutput, String> {
    // 从URL中提取channel_id或handle
    let channel_id = if channel_url.contains("/channel/") {
        channel_url.split("/channel/").nth(1)
            .and_then(|s| s.split('/').next())
            .unwrap_or("")
    } else if channel_url.contains("/c/") {
        channel_url.split("/c/").nth(1)
            .and_then(|s| s.split('/').next())
            .unwrap_or("")
    } else if channel_url.contains("/@") {
        channel_url.split("/@").nth(1)
            .and_then(|s| s.split('/').next())
            .unwrap_or("")
    } else {
        ""
    };

    if channel_id.is_empty() {
        return Ok(SearchVideosOutput {
            ok: false,
            data: serde_json::Value::Array(vec![]),
            error: Some("Could not parse channel ID from URL".to_string()),
        });
    }

    // 使用yt-dlp搜索频道视频
    let search_query = format!("site:youtube.com/watch?v={}", channel_id);
    let args = vec![
        "--search",
        &search_query,
        "60",
    ];
    let json = run_extractor(&args)?;
    let data: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
    Ok(SearchVideosOutput {
        ok: true,
        data,
        error: None,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_libmpv::init())
        // 關閉安全網：libmpv plugin 在視窗關閉時會 prevent_close 並背景 destroy mpv 實例；
        // 若內建播放器播放失敗/卡住導致 destroy 阻塞，視窗將永遠關不了。
        // 這裡另起一個守護線程：正常關閉時程序先結束、線程隨之消失；
        // 若 N 秒後程序仍活着（即 destroy 卡住），強制結束整個 APP。
        .on_window_event(|_window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                const FORCE_QUIT_AFTER_SECS: u64 = 8;
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(FORCE_QUIT_AFTER_SECS));
                    eprintln!("[NoadYT] 視窗關閉後程序仍未結束，強制退出（libmpv destroy 卡住的安全網）");
                    std::process::exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            search_videos,
            search_channels,
            get_stream_url,
            play_with_external_player,
            play_video_external,
            detect_players,
            open_url,
            clear_cache,
            check_python_environment,
            write_log,
            read_binary_file,
            get_channel_videos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
