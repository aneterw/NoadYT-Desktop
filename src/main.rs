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
    user_agent: Option<String>,
    subtitles: Vec<SubtitleTrack>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamInfo {
    best_combined: Option<(u64, String)>,
    best_dash_video: Option<(u64, String)>,
    best_dash_audio: Option<(u64, String)>,
    manifest_url: Option<String>,
    subtitles: Vec<SubtitleTrack>,
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

    // 解析 resolution
    let max_h = match input.resolution.as_deref() {
        None | Some("auto") => 1080u64,
        Some(h) => h.parse::<u64>().unwrap_or(1080),
    };

    // 判断是否为外部播放器模式
    let is_external = input.player_type.as_deref() == Some("external");

    // 获取 ffmpeg 路径（與 exe 同目錄的 resources/ffmpeg/ffmpeg.exe，MSI 打包后會隨程式一起安裝）
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("failed to get current exe path: {}", e))?;
    let dir = exe_path.parent().ok_or("failed to get exe parent directory")?;
    let ffmpeg_path = dir.join("resources").join("ffmpeg").join("ffmpeg.exe");
    let ffmpeg_str = ffmpeg_path.to_str().unwrap_or("");

    // 步骤 1：決定 subtitle_mode（Python 端用來控制字幕語言偏好）
    let subtitle_mode = input.subtitle_lang.as_deref().unwrap_or("auto");

    // === 步驟 2：先獲取串流資訊 ===
    let stream_info = match try_stream_url_full(&input.video_id, subtitle_mode) {
        Ok(info) => info,
        Err(e) => {
            dlog!("[DEBUG get_stream_url] Stream failed: {}, falling back to download", e);
            return try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode);
        }
    };

    // === 步驟 3：根據播放器類型選擇最佳軌跡 ===
    if is_external {
        // 外部播放器：直接傳遞串流 URL（視訊 + 音訊），讓播放器自己處理合併
        // 優先 DASH video（高解析度）+ DASH audio
        // 次选：Combined（單一文件，PotPlayer 可直接播放）
        // 最後：Download（帶字幕，最穩定）
        if let Some((v_h, v_url)) = &stream_info.best_dash_video {
            if let Some((a_h, a_url)) = &stream_info.best_dash_audio {
                // 直接傳遞兩個 URL 給外部播放器，不下載音頻到本地
                dlog!("[DEBUG get_stream_url] External: SELECTED DASH video={}p + audio={}p", v_h, a_h);
                return Ok(StreamResult {
                    path: v_url.clone(),
                    audio_url: Some(a_url.clone()),
                    subtitles: stream_info.subtitles.clone(),
                });
            }
        }
        // 沒有 DASH 分離軌跡，尝试 Combined（單一文件，PotPlayer 可直接播放）
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
    } else {
        // 内部播放器：Stream 优先（高品質、即時播放），失敗再 fallback 到 Download（帶字幕）
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
        // 内部播放器模式：给 YouTube 观看页面 URL + User-Agent，让 libmpv 自己解析
        let watch_url = format!("https://www.youtube.com/watch?v={}", input.video_id);
        dlog!("[DEBUG get_stream_url] Internal: giving watch URL to libmpv, ua={:?}", stream_info.user_agent.is_some());
        return Ok(StreamResult {
            path: watch_url,
            audio_url: None,
            user_agent: stream_info.user_agent.clone(),
            subtitles: stream_info.subtitles.clone(),
        });
    }
}

/// 步骤 2：串流分析（参考 NoadYTTV 的 getBestPlaybackInfo 逻辑）
/// 收集所有軌跡：Combined、DASH-video、DASH-audio、manifest
fn try_stream_url_full(video_id: &str, subtitle_mode: &str) -> Result<StreamInfo, String> {
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

    for f in formats.iter() {
        let vcodec = f.get("vcodec").and_then(|v| v.as_str()).unwrap_or("");
        let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("");
        let url = f.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let m_url = f.get("manifest_url").and_then(|v| v.as_str()).unwrap_or("");
        let height = f.get("height").and_then(|v| v.as_u64()).unwrap_or(0);

        if url.is_empty() && m_url.is_empty() { continue; }

        // 記錄 manifest URL
        if !m_url.is_empty() && manifest_url.is_none() {
            manifest_url = Some(m_url.to_string());
        }

        // 收集 Combined（有聲有影）軌道
        if !url.is_empty() && !acodec.is_empty() && acodec != "none" {
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

    dlog!("[DEBUG try_stream_url_full] Combined: {:?}, DASH-video: {:?}, DASH-audio: {:?}, manifest: {:?}",
        best_combined.as_ref().map(|(h,_)| *h), best_dash_video.as_ref().map(|(h,_)| *h), best_dash_audio.is_some(), manifest_url.is_some());

    // 提取 User-Agent
    let mut user_agent: Option<String> = None;
    if let Some(formats_arr) = info.get("formats").and_then(|v| v.as_array()) {
        for f in formats_arr.iter() {
            if let Some(headers) = f.get("http_headers").and_then(|v| v.as_object()) {
                if let Some(ua) = headers.get("User-Agent").and_then(|v| v.as_str()) {
                    user_agent = Some(ua.to_string());
                    break;
                }
            }
        }
    }

    Ok(StreamInfo {
        best_combined,
        best_dash_video,
        best_dash_audio,
        manifest_url,
        subtitles,
        user_agent,
    })
}

/// 步驟 2：download+ffmpeg（Android TV 做法：下載+ffmpeg 合併成 MP4，帶字幕）
fn try_download(video_id: &str, max_h: u64, ffmpeg_str: &str, subtitle_mode: &str) -> Result<StreamResult, String> {
    let json = run_extractor(&["--download", video_id, &max_h.to_string(), ffmpeg_str, subtitle_mode])?;
    dlog!("[DEBUG try_download] stdout (first 200 chars): {:?}", &json[..json.len().min(200)]);

    let info = match extract_json_from_stdout(&json) {
        Some(v) => v,
        None => {
            dlog!("[DEBUG try_download] JSON parse failed, scanning cache dir for {}", video_id);
            let cache_dir = env::temp_dir().join("NoadYT-Desktop").join("downloads");

            if !cache_dir.exists() {
                return Err("no JSON in download response and cache dir not found".to_string());
            }

            let mut mp4_path: Option<std::path::PathBuf> = None;
            let mut vtt_files: Vec<std::path::PathBuf> = Vec::new();

            if let Ok(entries) = std::fs::read_dir(&cache_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext == "mp4" || ext == "MP4" {
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if name.starts_with(video_id) {
                                    if name == format!("{}.mp4", video_id) {
                                        mp4_path = Some(path.clone());
                                    } else if mp4_path.is_none() {
                                        mp4_path = Some(path.clone());
                                    }
                                    dlog!("[DEBUG try_download] found mp4: {}", name);
                                }
                            }
                        } else if ext == "vtt" || ext == "VTT" {
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if name.starts_with(video_id) {
                                    vtt_files.push(path.clone());
                                    dlog!("[DEBUG try_download] found vtt: {}", name);
                                }
                            }
                        }
                    }
                }
            }

            if mp4_path.is_none() {
                let direct_path = cache_dir.join(format!("{}.mp4", video_id));
                if direct_path.exists() {
                    mp4_path = Some(direct_path);
                }
            }

            if let Some(mp4) = mp4_path {
                dlog!("[DEBUG try_download] found cached MP4: {:?}", mp4);
                let file_uri = format!("file:///{}", mp4.to_string_lossy().replace('\\', "/"));

                let mut subtitles: Vec<SubtitleTrack> = Vec::new();
                vtt_files.sort_by(|a, b| {
                    let name_a = a.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let name_b = b.file_name().unwrap_or_default().to_string_lossy().to_string();
                    let a_is_tt = name_a.contains("TimedText");
                    let b_is_tt = name_b.contains("TimedText");
                    match (a_is_tt, b_is_tt) {
                        (true, false) => std::cmp::Ordering::Less,
                        (false, true) => std::cmp::Ordering::Greater,
                        _ => name_a.cmp(&name_b),
                    }
                });
                for sub in &vtt_files {
                    let sub_path = sub.to_string_lossy().replace('\\', "/").to_string();
                    let language = sub.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                    let name = language.clone();
                    subtitles.push(SubtitleTrack { language, name, path: sub_path });
                }

                return Ok(StreamResult {
                    path: file_uri,
                    audio_url: None,
                    subtitles,
                });
            }
            return Err("no JSON in download response and no cached MP4 found".to_string());
        }
    };

    // 如果有 JSON，解析 subtitle 信息
    let mut subtitles: Vec<SubtitleTrack> = Vec::new();
    if let Some(subs_arr) = info.get("subtitles").and_then(|v| v.as_array()) {
        for sub in subs_arr {
            let language = sub.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let sub_path = sub.get("path").and_then(|v| v.as_str()).unwrap_or("").to_string();
            // 轉換為 Windows 本地路徑
            let sub_path = sub_path.strip_prefix("file:///").unwrap_or(&sub_path).to_string().replace('/', "\\");
            if !sub_path.is_empty() {
                dlog!("[DEBUG try_download] Found subtitle: {} - {}", language, sub_path);
                subtitles.push(SubtitleTrack { language, name: name.clone(), path: sub_path });
            }
        }
    }
    dlog!("[DEBUG try_download] subtitle tracks: {}", subtitles.len());

    // 從 JSON 中取得下載後的 MP4 路徑
    let file_uri = info.get("path")
        .and_then(|v| v.as_str())
        .map(|p| format!("file:///{}", p.replace('\\', "/")))
        .unwrap_or_else(|| format!("file:///{}", video_id));

    Ok(StreamResult {
        path: file_uri,
        audio_url: None,
        subtitles,
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
#[command]
fn clear_cache() -> Result<bool, String> {
    let temp_dir = env::temp_dir();
    let cache_dirs = vec![
        temp_dir.join("NoadYT-Desktop").join("downloads"),
        temp_dir.join("NoadYT-Desktop").join("subtitles"),
    ];
    for dir in &cache_dirs {
        if dir.exists() {
            for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                }
            }
        }
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

fn main() {
    Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
