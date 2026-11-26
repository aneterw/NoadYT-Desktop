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

    // 字幕語言（'none' = 不要字幕，Python 端不下載）
    let subtitle_mode = input.subtitle_lang.as_deref().unwrap_or("auto");
    // 解析度上限字串（auto / 1080 / 720 / 480 / 360）
    let res_arg = input.resolution.as_deref().unwrap_or("auto");

    // run19.py 同源取串流：Python 端用與外部播放器完全相同的 yt-dlp format 字串
    // （直播 LIVE_PREFER_30FPS、一般 bestvideo+bestaudio），回傳影像 URL + 音訊 URL + UA + 字幕
    let json_str = run_extractor(&["--stream", &input.video_id, subtitle_mode, res_arg])
        .map_err(|e| format!("取得串流失敗: {}", e))?;
    dlog!("[DEBUG get_stream_url] --stream OK, json_len={}", json_str.len());

    let parsed: serde_json::Value = extract_json_from_stdout(&json_str)
        .ok_or("no JSON in stream response")?;
    if parsed.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return Err(parsed.get("error").and_then(|v| v.as_str())
            .map(|s| format!("串流來源失敗: {}", s))
            .unwrap_or_else(|| "串流來源回傳錯誤".to_string()));
    }

    let video_url = parsed.get("video_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let audio_url = parsed.get("audio_url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let user_agent = parsed.get("user_agent").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let is_live = parsed.get("is_live").and_then(|v| v.as_bool()).unwrap_or(false);

    if video_url.is_empty() {
        return Err("串流來源未回傳影像 URL".to_string());
    }

    // 字幕軌（本地 vtt 路徑）
    let mut subtitles: Vec<SubtitleTrack> = Vec::new();
    if let Some(subs_arr) = parsed.get("subtitles").and_then(|v| v.as_array()) {
        for sub in subs_arr {
            let language = sub.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let path = sub.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if !path.is_empty() {
                subtitles.push(SubtitleTrack { language, name, path });
            }
        }
    }

    let audio_url_opt = if audio_url.is_empty() { None } else { Some(audio_url) };
    dlog!("[DEBUG get_stream_url] STREAM source=run19.py video_url_len={} audio={} is_live={} subs={} ua_len={}",
        video_url.len(), audio_url_opt.is_some(), is_live, subtitles.len(), user_agent.len());

    Ok(StreamResult {
        path: video_url,
        audio_url: audio_url_opt,
        subtitles,
        user_agent: if user_agent.is_empty() { None } else { Some(user_agent) },
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
