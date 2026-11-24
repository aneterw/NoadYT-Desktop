#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::env;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use tauri::command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// 日誌函數：寫入專案目錄 app.log
fn log_to_file(msg: &str) {
    let log_path = std::path::Path::new(r"C:\Users\Aneter-MiniPC\NoadYT-Desktop\app.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] {}", timestamp, msg);
    }
}

// 同時輸出到 stderr 和檔案
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

/// 呼叫 Python 腳本（與 Android TV 一樣直接調用 .py 文件，不經過 PyInstaller 打包）
/// 開發模式：使用 CARGO_MANIFEST_DIR（專案根目錄）下的 python/youtube_extractor.py
/// 打包後：使用與主程式同目錄的 resources/python/youtube_extractor.py
fn find_python_exe() -> Result<String, String> {
    // 嘗試多種 Python 執行檔名稱，並驗證 yt_dlp 可匯入，確保與同一環境協同工作
    for candidate in ["python", "python3", "py"] {
        let mut cmd = Command::new(candidate);
        cmd.arg("-c").arg("import yt_dlp; print(yt_dlp.version.__version__)");
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                return Ok(candidate.to_string());
            }
        }
    }
    Err("未找到已安裝 yt_dlp 的 Python 環境，請執行：pip install yt-dlp youtube_transcript_api".to_string())
}

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
        let dir = exe_path.parent()
            .ok_or("failed to get exe parent directory")?;
        dir.join("resources").join("python").join("youtube_extractor.py")
    };

    if !py_path.exists() {
        return Err(format!("Python script not found: {}", py_path.display()));
    }

    let py_exe = find_python_exe()?;

            dlog!("[DEBUG run_extractor] py_exe={:?}, py_path={:?}, args={:?}", py_exe, py_path, args);

            let mut cmd = Command::new(&py_exe);
        // -u: 無緩衝模式，避免大量輸出時 pipe 死鎖
        cmd.arg("-u")
            .arg(&py_path)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd.spawn()
                        .map_err(|e| format!("failed to spawn python: {}", e))?;

                // 同時讀取 stdout 和 stderr，避免緩衝區滿死鎖
                        let mut child_stdout = child.stdout.take().expect("Failed to capture stdout");
                        let mut child_stderr = child.stderr.take().expect("Failed to capture stderr");

                // 共享 child 所有權給線程和主線程（用於 timeout kill）
                let child = std::sync::Arc::new(std::sync::Mutex::new(Some(child)));
                let child_clone = child.clone();

                let (tx, rx) = mpsc::channel();
                thread::spawn(move || {
                    use std::io::Read;
                    let mut child_guard = child_clone.lock().unwrap();
                    if let Some(mut child) = child_guard.take() {
                        let mut stdout_buf = Vec::new();
                        let mut stderr_buf = Vec::new();
                        let _ = child_stdout.read_to_end(&mut stdout_buf);
                        let _ = child_stderr.read_to_end(&mut stderr_buf);
                        let status = child.wait().map_err(|e| e.to_string());
                        let _ = tx.send((status, stdout_buf, stderr_buf));
                    }
                });

                let (status, stdout_buf, stderr_buf) = match rx.recv_timeout(Duration::from_secs(300)) {
                                    Ok(result) => {
                                        dlog!("[DEBUG run_extractor] completed successfully");
                                        result
                                    }
                                    Err(_) => {
                                        dlog!("[DEBUG run_extractor] TIMEOUT after 300 seconds, killing process");
                                        let mut child_guard = child.lock().unwrap();
                                        if let Some(mut child) = child_guard.take() {
                                            let pid = child.id();
                                            let _ = child.kill();
                                            #[cfg(windows)]
                                            {
                                                let _ = std::process::Command::new("taskkill")
                                                    .args(["/F", "/T", "/PID", &pid.to_string()])
                                                    .status();
                                            }
                                        }
                                        return Err("Python 提取超時（300秒），請嘗試指定解析度或使用外部播放器".to_string());
                                    }
                                };
                                let status = status.map_err(|e| format!("python process error: {}", e))?;

                                let stdout = String::from_utf8_lossy(&stdout_buf).trim().to_string();
                                let stderr = String::from_utf8_lossy(&stderr_buf).trim().to_string();

                                if !status.success() {
                                    return Err(format!(
                                        "extractor failed (code: {:?}, stderr: {})",
                                        status.code(),
                                        if stderr.is_empty() { "<no stderr>" } else { &stderr }
                                    ));
                                }
                                if stdout.is_empty() {
                                    return Err(format!(
                                        "extractor returned empty output (code: {:?}, stderr: {})",
                                        status.code(),
                                        if stderr.is_empty() { "<no stderr>" } else { &stderr }
                                    ));
                                }

                                Ok(stdout)
                            }

/// 從可能被 yt-dlp 日誌或除錯訊息污染的 stdout 中提取純 JSON。
/// 找到第一個 '{' 或 '[' 與最後一個 '}' 或 ']' 之間的內容並嘗試解析。
fn extract_json_from_stdout(stdout: &str) -> Option<serde_json::Value> {
    dlog!("[DEBUG extract_json_from_stdout] stdout len={}", stdout.len());

    // 嘗試 1：直接解析整個 stdout
    if let Ok(v) = serde_json::from_str(stdout) {
        dlog!("[DEBUG extract_json_from_stdout] parsed full stdout OK");
        return Some(v);
    }

    // 嘗試 2：從第一個 { 或 [ 到最後一個 } 或 ]
    let start_obj = stdout.find('{');
    let start_arr = stdout.find('[');
    let start = match (start_obj, start_arr) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => {
            dlog!("[DEBUG extract_json_from_stdout] no {{ or [ found");
            return None;
        }
    }?;
    let end_obj = stdout.rfind('}');
    let end_arr = stdout.rfind(']');
    let end = match (end_obj, end_arr) {
        (Some(a), Some(b)) => Some(a.max(b)),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => {
            dlog!("[DEBUG extract_json_from_stdout] no }} or ] found");
            return None;
        }
    }?;
    if end <= start {
        dlog!("[DEBUG extract_json_from_stdout] end <= start");
        return None;
    }
    let json_str = &stdout[start..=end];
    dlog!("[DEBUG extract_json_from_stdout] trying slice len={}", json_str.len());
    match serde_json::from_str(json_str) {
        Ok(v) => {
            dlog!("[DEBUG extract_json_from_stdout] slice parsed OK");
            Some(v)
        }
        Err(e) => {
            dlog!("[DEBUG extract_json_from_stdout] slice parse failed: {}", e);
            None
        }
    }
}

#[command]
fn check_python_environment() -> Result<String, String> {
    // 偵測可用的 Python 執行檔
    let py_exe = find_python_exe()?;

    // 檢查 Python 版本
    let mut cmd = Command::new(&py_exe);
    cmd.arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("Python 未安裝或無法啟動：{}", e))?;

    if !output.status.success() {
        return Err("Python 未安裝或無法啟動".to_string());
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // 檢查 yt_dlp 是否可匯入
    let mut cmd = Command::new(&py_exe);
    cmd.arg("-c")
        .arg("import yt_dlp; print(yt_dlp.version.__version__)")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("無法檢查 yt_dlp：{}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "yt_dlp 未安裝，請執行：pip install yt-dlp youtube_transcript_api\n錯誤：{}",
            if stderr.is_empty() { "<未知錯誤>" } else { &stderr }
        ));
    }

    let ytdlp_version = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // 檢查 python/youtube_extractor.py 是否存在
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
        let dir = exe_path.parent()
            .ok_or("failed to get exe parent directory")?;
        dir.join("resources").join("python").join("youtube_extractor.py")
    };

    if !py_path.exists() {
        return Err(format!("找不到 python 腳本：{}", py_path.display()));
    }

    Ok(format!("Python 環境就緒：{}，yt_dlp：{}", version, ytdlp_version))
}

#[command]
fn search_videos(input: SearchVideosInput) -> Result<SearchVideosOutput, String> {
    let mut args: Vec<String> = vec!["--search".to_string(), input.keyword.clone()];
    if let Some(max) = input.maxResults {
        args.push("--max-downloads".to_string());
        args.push(max.to_string());
    }
    let args_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let json = run_extractor(&args_refs)?;
    let data = extract_json_from_stdout(&json).unwrap_or(serde_json::Value::Null);
    Ok(SearchVideosOutput {
        ok: true,
        data,
        error: None,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetStreamUrlInput {
    #[serde(default)]
    pub player_type: Option<String>, // "internal" | "external"
    video_id: String,
    resolution: Option<String>, // "auto" | "1080" | "720" | "480"
    subtitle_lang: Option<String>, // "auto" | "en" | "zh-Hans" | "zh-Hant" | "ja" | "es" | "de" | "fr"
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SubtitleTrack {
    language: String,
    name: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamResult {
    path: String,
    audio_url: Option<String>, // 分離的音頻 URL（如果有的話）
    subtitles: Vec<SubtitleTrack>,
}

#[command]
fn get_stream_url(input: GetStreamUrlInput) -> Result<StreamResult, String> {
    dlog!("[DEBUG get_stream_url] START video_id={} resolution={:?}", input.video_id, input.resolution);
    // 決策：
    //   auto   → download 優先（帶字幕，Blob URL 播放，WebView2 可靠）
    //   指定   → download 優先（帶字幕，Blob URL 播放，WebView2 可靠）
    // 串流 URL 在 WebView2 中無法播放（缺少 Referer/User-Agent），故優先 download
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

    // 步驟 1：決定 subtitle_mode（Python 端用來控制字幕語言偏好）
    //   用戶選擇的語言代碼（auto, en, zh-Hans, zh-Hant, ja, es, de, fr）
    let subtitle_mode = input.subtitle_lang.as_deref().unwrap_or("auto");

    // 步驟 2：根據播放器類型決定策略
    let is_external = input.player_type.as_deref() == Some("external");

    // === 步驟 2：先獲取串流資訊（參考 NoadYTTV 的 getBestPlaybackInfo 邏輯）===
    let stream_info = match try_stream_url_full(&input.video_id, "auto") {
        Ok(info) => info,
        Err(e) => {
            dlog!("[DEBUG get_stream_url] Stream failed: {}, falling back to download", e);
            // 串流完全失敗，直接下載
            return try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode);
        }
    };

    // === 步驟 3：根據播放器類型選擇最佳軌跡 ===
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
        // 沒有 DASH 分離軌跡，嘗試 Combined
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
        // 內部播放器：Stream 優先（高品質、即時播放），失敗再 fallback 到 Download（帶字幕）
        // 優先 Combined > DASH video+audio > manifest
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
        // 都失敗，fallback 到 Download（帶字幕）
        dlog!("[DEBUG get_stream_url] Internal: No suitable stream, trying download...");
        try_download(&input.video_id, max_h, &ffmpeg_str, subtitle_mode)
    }
}

/// 步驟 2：串流分析（參考 NoadYTTV 的 getBestPlaybackInfo 邏輯）
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
    let mut found_from_json = false;
    if let Some(subs_arr) = info.get("subtitles").and_then(|v| v.as_array()) {
        for sub in subs_arr {
            let language = sub.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut sub_path = sub.get("local_path")
                .or(sub.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // 轉換為 Windows 本地路徑（外部播放器需要本地路徑，不是 file:/// URL）
            if sub_path.starts_with("file:///") {
                sub_path = sub_path.strip_prefix("file:///").unwrap_or(&sub_path).to_string();
                sub_path = sub_path.replace('/', "\\");
            }
            if !sub_path.is_empty() {
                dlog!("[DEBUG try_stream_url_full] Found subtitle: {} - {}", language, sub_path);
                subtitles.push(SubtitleTrack { language, name, path: sub_path });
                found_from_json = true;
            }
        }
    }

    // 如果从 JSON 没有找到字幕，尝试从本地字幕目录扫描（Python 可能已经下载了但没返回 JSON）
    if subtitles.is_empty() {
        dlog!("[DEBUG try_stream_url_full] No subtitles from JSON, scanning local subtitle dir...");
        let subtitle_dir = env::temp_dir().join("NoadYT-Desktop").join("subtitles");
        if let Ok(entries) = std::fs::read_dir(&subtitle_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "vtt" || ext == "VTT" {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with(&format!("{}_", video_id)) {
                                let language = name.split('_').nth(1).unwrap_or("unknown").to_string();
                                let language_clone = language.clone();
                                let sub_path = path.to_string_lossy().replace('\\', "/");
                                dlog!("[DEBUG try_stream_url_full] Found local subtitle: {} - {}", language, sub_path);
                                subtitles.push(SubtitleTrack {
                                    language,
                                    name: format!("{} ({})", language_clone, sub_path.split('.').next().unwrap_or(&sub_path)),
                                    path: sub_path.to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    dlog!("[DEBUG try_stream_url_full] Total subtitle tracks: {}", subtitles.len());

    // 收集所有軌跡
    let mut best_combined: Option<(u64, String)> = None;
    let mut best_dash_video: Option<(u64, String)> = None;
    let mut best_dash_audio: Option<(u64, String)> = None;
    let mut manifest_url: Option<String> = None;

    for f in formats.iter() {
        let vcodec = f.get("vcodec").and_then(|v| v.as_str()).unwrap_or("");
        let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("");
        let url = f.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let m_url = f.get("manifest_url").and_then(|v| v.as_str()).unwrap_or("");
        let height = f.get("height").and_then(|v| v.as_u64()).unwrap_or(0);

        if url.is_empty() && m_url.is_empty() { continue; }

        if !m_url.is_empty() && manifest_url.is_none() {
            manifest_url = Some(m_url.to_string());
        }

        if !url.is_empty() && !acodec.is_empty() && acodec != "none" {
            if let Some((cur_h, _)) = best_combined {
                if height > cur_h {
                    best_combined = Some((height, url.to_string()));
                }
            } else {
                best_combined = Some((height, url.to_string()));
            }
        }

        if !url.is_empty() && (acodec.is_empty() || acodec == "none") {
            if let Some((cur_h, _)) = best_dash_video {
                if height > cur_h {
                    best_dash_video = Some((height, url.to_string()));
                }
            } else {
                best_dash_video = Some((height, url.to_string()));
            }
        }

        if !url.is_empty() && (vcodec.is_empty() || vcodec == "none") && !acodec.is_empty() && acodec != "none" {
            if let Some((cur_ab, _)) = best_dash_audio {
                best_dash_audio = Some((cur_ab, url.to_string()));
            } else {
                best_dash_audio = Some((0, url.to_string()));
            }
        }
    }

    dlog!("[DEBUG try_stream_url_full] Combined: {:?}, DASH-video: {:?}, DASH-audio: {:?}, manifest: {:?}",
        best_combined.as_ref().map(|(h,_)| *h), best_dash_video.as_ref().map(|(h,_)| *h), best_dash_audio.is_some(), manifest_url.is_some());

    Ok(StreamInfo {
        best_combined,
        best_dash_video,
        best_dash_audio,
        manifest_url,
        subtitles,
    })
}

/// 串流選擇結果
#[derive(Debug)]
struct StreamInfo {
    best_combined: Option<(u64, String)>,
    best_dash_video: Option<(u64, String)>,
    best_dash_audio: Option<(u64, String)>,
    manifest_url: Option<String>,
    subtitles: Vec<SubtitleTrack>,
}

/// 步驟 2：download+ffmpeg（Android TV 做法：下載+ffmpeg 合併成 MP4，帶字幕）
fn try_download(video_id: &str, max_h: u64, ffmpeg_str: &str, subtitle_mode: &str) -> Result<StreamResult, String> {
    let json = run_extractor(&["--download", video_id, &max_h.to_string(), ffmpeg_str, subtitle_mode])?;
    dlog!("[DEBUG try_download] stdout (first 200 chars): {:?}", &json[..json.len().min(200)]);

    let info = match extract_json_from_stdout(&json) {
        Some(v) => v,
        None => {
            // JSON 解析失敗（stdout 被 yt-dlp 進度文本污染），掃描 cache 目錄中的所有相關文件
            dlog!("[DEBUG try_download] JSON parse failed, scanning cache dir for {}", video_id);
            let cache_dir = env::temp_dir().join("NoadYT-Desktop").join("downloads");

            if !cache_dir.exists() {
                return Err("no JSON in download response and cache dir not found".to_string());
            }

            // 掃描所有以 video_id 開頭的 .mp4 文件（如 eKtlNsuzz-s.mp4, eKtlNsuzz-s.f616.mp4）
            let mut mp4_path: Option<std::path::PathBuf> = None;
            // 掃描所有以 video_id 開頭的 .vtt 字幕文件
            let mut vtt_files: Vec<std::path::PathBuf> = Vec::new();

            if let Ok(entries) = std::fs::read_dir(&cache_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ext == "mp4" || ext == "MP4" {
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if name.starts_with(video_id) {
                                    // 優先選擇正確名稱 {video_id}.mp4，否則選第一個匹配的
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

            // 如果沒有找到以 video_id 開頭的 mp4，嘗試直接匹配 {video_id}.mp4
            if mp4_path.is_none() {
                let direct_path = cache_dir.join(format!("{}.mp4", video_id));
                if direct_path.exists() {
                    mp4_path = Some(direct_path);
                }
            }

            if let Some(mp4) = mp4_path {
                dlog!("[DEBUG try_download] found cached MP4: {:?}", mp4);
                let file_uri = format!("file:///{}", mp4.to_string_lossy().replace('\\', "/"));

                // 構建字幕軌道列表
                let mut subtitles: Vec<SubtitleTrack> = Vec::new();
                // 排序 vtt 文件，TimedText 優先
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
                for (idx, entry) in vtt_files.iter().enumerate() {
                    let path_str = entry.to_string_lossy().replace('\\', "/");
                    let name = entry.file_name().unwrap().to_string_lossy().to_string();
                    let language = name.split('.').nth(1).unwrap_or("unknown").to_string();
                    let file_uri = format!("file:///{}", path_str);
                    subtitles.push(SubtitleTrack {
                        language,
                        name: name.clone(),
                        path: file_uri,
                    });
                    dlog!("[DEBUG try_download] subtitle[{}]: {}", idx, name);
                }

                dlog!("[DEBUG try_download] subtitle tracks from vtt scan: {}", subtitles.len());
                return Ok(StreamResult { path: file_uri, audio_url: None, subtitles });
            }

            return Err("no JSON in download response and no cached MP4 found".to_string());
        }
    };

    let ok = info.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    if !ok {
        let err = info.get("error").and_then(|v| v.as_str()).unwrap_or("未知錯誤");
        return Err(format!("下載失敗: {}", err));
    }

    let path = info.get("path").and_then(|v| v.as_str()).ok_or(format!(
        "no local path returned from Python. Raw response: {}",
        json
    ))?;

    if path.is_empty() {
        return Err(format!("local path is empty. Raw response: {}", json));
    }

    dlog!("[DEBUG try_download] local file path: {}", path);

    // Windows 本地路徑轉 file:// URI，否則 <video src> 和 <track src> 無法載入
    let file_uri = if path.contains('\\') {
        let uri_path = path.replace('\\', "/");
        format!("file:///{}", uri_path)
    } else {
        path.to_string()
    };
    dlog!("[DEBUG try_download] file URI: {}", file_uri);

    // 解析字幕軌道（字幕路徑也轉 file:// URI）
    let mut subtitles: Vec<SubtitleTrack> = Vec::new();
    if let Some(subs_arr) = info.get("subtitles").and_then(|v| v.as_array()) {
        // 優先選擇 TimedText 字幕，其次是 YouTube Transcribe (YTA)
        let mut timedtext_subs: Vec<SubtitleTrack> = Vec::new();
        let mut other_subs: Vec<SubtitleTrack> = Vec::new();
        for sub in subs_arr {
            let language = sub.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = sub.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut sub_path = sub.get("local_path")
                .or(sub.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if sub_path.contains('\\') {
                // Already Windows path, keep as is
            } else if sub_path.starts_with("file:///") {
                sub_path = sub_path.strip_prefix("file:///").unwrap_or(&sub_path).to_string();
                sub_path = sub_path.replace('/', "\\");
            }
            if !sub_path.is_empty() {
                let track = SubtitleTrack { language, name: name.clone(), path: sub_path };
                if name.contains("TimedText") {
                    timedtext_subs.push(track);
                } else {
                    other_subs.push(track);
                }
            }
        }
        // TimedText 優先
        subtitles.extend(timedtext_subs);
        subtitles.extend(other_subs);
    }
    dlog!("[DEBUG try_download] subtitle tracks: {}", subtitles.len());

    Ok(StreamResult {
        path: file_uri,
        audio_url: None,
        subtitles,
    })
}

/// 清除下載和字幕緩存目錄
#[command]
fn clear_cache() -> Result<bool, String> {
    let temp_dir = env::temp_dir();
    let cache_dirs = vec![
        temp_dir.join("NoadYT-Desktop").join("downloads"),
        temp_dir.join("NoadYT-Desktop").join("subtitles"),
    ];
    let mut cleared = 0;
    for dir in &cache_dirs {
        if dir.exists() {
            for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                    cleared += 1;
                }
            }
            dlog!("[DEBUG clear_cache] cleared {} files from {:?}", cleared, dir);
        }
    }
    Ok(true)
}

/// 步驟 3：串流 fallback（--info，無字幕）
/// 舊的串流選擇函數（已棄用，保留備用）
#[allow(dead_code)]
fn try_stream_url(video_id: &str) -> Result<StreamResult, String> {
    dlog!("[DEBUG try_stream_url] START video_id={}", video_id);
    let json = run_extractor(&["--info", video_id, "auto"])?;
    dlog!("[DEBUG try_stream_url] run_extractor OK, json_len={}", json.len());
    dlog!("[DEBUG try_stream_url] raw stdout (first 200 chars): {:?}", json.chars().take(200).collect::<String>());

    let info = match extract_json_from_stdout(&json) {
            Some(v) => {
                dlog!("[DEBUG try_stream_url] extract_json_from_stdout OK");
                v
            }
            None => {
                dlog!("[DEBUG try_stream_url] extract_json_from_stdout FAILED - returning empty JSON");
                return Err("no JSON in stream response".to_string());
            }
        };

        // 找第一個有 URL 的格式（優先直接 HTTPS URL，次之 m3u8 manifest）
        // 優先順序：有聲有影 (progressive) > 只視訊 > m3u8 manifest
        dlog!("[DEBUG try_stream_url] looking for formats array...");
        let formats = info.get("formats").and_then(|v| v.as_array()).ok_or("no formats array")?;
        dlog!("[DEBUG try_stream_url] total formats: {}", formats.len());

        let mut av_url: Option<String> = None;    // 有聲有影
        let mut video_only_url: Option<String> = None; // 只視訊
        let mut manifest_url: Option<String> = None;

        for f in formats.iter() {
            let vcodec = f.get("vcodec").and_then(|v| v.as_str()).unwrap_or("");
            let acodec = f.get("acodec").and_then(|v| v.as_str()).unwrap_or("");
            let url = f.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let m_url = f.get("manifest_url").and_then(|v| v.as_str()).unwrap_or("");
            if vcodec == "none" || url.is_empty() { continue; }

            if manifest_url.is_none() && !m_url.is_empty() {
                manifest_url = Some(m_url.to_string());
            }

            if m_url.is_empty() {
                if av_url.is_none() && acodec != "none" && !acodec.is_empty() {
                    av_url = Some(url.to_string());
                } else if video_only_url.is_none() && acodec == "none" {
                    video_only_url = Some(url.to_string());
                }
            }

            if av_url.is_some() && manifest_url.is_some() { break; }
        }

        let best_url = av_url.or(video_only_url).or(manifest_url).ok_or("no playable stream found")?;
        dlog!("[DEBUG try_stream_url] stream URL: {}", best_url);
        Ok(StreamResult { path: best_url, audio_url: None, subtitles: Vec::new() })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchChannelsInput {
    keyword: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchChannelsOutput {
    ok: bool,
    data: serde_json::Value,
    error: Option<String>,
}

#[command]
fn search_channels(input: SearchChannelsInput) -> Result<SearchChannelsOutput, String> {
    let json = run_extractor(&["--channels", &input.keyword])?;
    let data: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
    Ok(SearchChannelsOutput {
        ok: true,
        data,
        error: None,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetChannelVideosInput {
    channel_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GetChannelVideosOutput {
    ok: bool,
    data: serde_json::Value,
    error: Option<String>,
}

#[command]
fn get_channel_videos(input: GetChannelVideosInput) -> Result<GetChannelVideosOutput, String> {
    let json = run_extractor(&["--playlist", &input.channel_url])?;
    let data: serde_json::Value = serde_json::from_str(&json).unwrap_or(serde_json::Value::Null);
    Ok(GetChannelVideosOutput {
        ok: true,
        data,
        error: None,
    })
}

#[command]
fn play_with_external_player(video_path: String, audio_path: Option<String>, subtitle_paths: Vec<String>, player: String) -> Result<String, String> {
    use std::process::Command;

    dlog!("[DEBUG play_with_external_player] START player={} video_path={} audio_path={:?} subtitle_count={}", player, video_path, audio_path, subtitle_paths.len());

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

    // 輔助函數：將 file:/// URL 或任意路徑轉換為純 Windows 路徑
    fn to_windows_path(p: &str) -> String {
        p.strip_prefix("file:///")
            .unwrap_or(p)
            .replace('/', "\\")
    }

    // 準備字幕參數
    let subs_args: Vec<String> = if is_remote_url {
        subtitle_paths.clone()
    } else {
        subtitle_paths.iter().map(|s| to_windows_path(s)).collect()
    };

    // 準備音頻參數（PotPlayer/mpv/VLC 支援獨立音軌）
    let audio_arg = audio_path.as_deref();

    // PotPlayer: 影片路徑先加入，字幕用 /sub=，音頻用 /audio=
    if player == "potplayer" {
        cmd.arg(&video_path);
        if let Some(audio) = audio_arg {
            cmd.arg(format!("/audio={}", audio));
        }
        for sub in &subs_args {
            cmd.arg(format!("/sub={}", sub));
        }
    } else if player == "mpv" || player == "vlc" {
        cmd.arg(&video_path);
        if let Some(audio) = audio_arg {
            cmd.arg(audio);
        }
        for sub in &subs_args {
            cmd.arg("--sub-file").arg(sub);
        }
    } else {
        cmd.arg(&video_path);
        if let Some(audio) = audio_arg {
            cmd.arg(audio);
        }
    }

    // 分離進程，不等待播放器關閉
    dlog!("[DEBUG play_with_external_player] spawning process...");
    cmd.spawn()
        .map_err(|e| format!("無法啟動 {} 播放器: {}", player, e))?;

    dlog!("[DEBUG play_with_external_player] spawn OK");
    Ok(format!("{} 播放器已啟動", player))
}

fn find_player_exe(player: &str, paths: &[&str]) -> Option<String> {
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

    eprintln!("[DEBUG find_player_exe] {} 播放器未找到，嘗試的路徑: {:?}", player, paths);
    None
}

#[command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    fs::read(&path).map_err(|e| format!("無法讀取檔案: {}", e))
}

fn main() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("local-files", move |_app, req| {
            let uri_str = req.uri().to_string();
            eprintln!("[DEBUG URI Scheme] Received URI: {}", uri_str);
            if let Some(path) = uri_str.strip_prefix("tauri://local-files/") {
                let windows_path = path.replace("/", "\\");
                eprintln!("[DEBUG URI Scheme] Windows path: {}", windows_path);
                match std::fs::read(&windows_path) {
                    Ok(data) => {
                        eprintln!("[DEBUG URI Scheme] File found, size: {} bytes", data.len());
                        let mut response = tauri::http::Response::new(data);
                        *response.status_mut() = tauri::http::StatusCode::OK;
                        let ext = windows_path.rsplit('.').next().unwrap_or("");
                        let content_type = match ext.to_lowercase().as_str() {
                            "mp4" => "video/mp4",
                            "vtt" => "text/vtt",
                            "webm" => "video/webm",
                            "m3u8" => "application/vnd.apple.mpegurl",
                            _ => "application/octet-stream",
                        };
                        response.headers_mut().insert(
                            tauri::http::header::CONTENT_TYPE,
                            tauri::http::header::HeaderValue::from_str(content_type)
                                .unwrap_or(tauri::http::header::HeaderValue::from_static("application/octet-stream")),
                        );
                        response.headers_mut().insert(
                            tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN,
                            tauri::http::header::HeaderValue::from_static("*"),
                        );
                        response.headers_mut().insert(
                            tauri::http::header::ACCESS_CONTROL_ALLOW_METHODS,
                            tauri::http::header::HeaderValue::from_static("GET, OPTIONS"),
                        );
                        response.headers_mut().insert(
                            tauri::http::header::ACCEPT_RANGES,
                            tauri::http::header::HeaderValue::from_static("bytes"),
                        );
                        response
                    }
                    Err(e) => {
                        eprintln!("[DEBUG URI Scheme] File not found: {}", e);
                        let mut response = tauri::http::Response::new(b"File not found".to_vec());
                        *response.status_mut() = tauri::http::StatusCode::NOT_FOUND;
                        response
                    }
                }
            } else {
                eprintln!("[DEBUG URI Scheme] Invalid URI format");
                let mut response = tauri::http::Response::new(b"Not found".to_vec());
                *response.status_mut() = tauri::http::StatusCode::NOT_FOUND;
                response
            }
        })
        .invoke_handler(tauri::generate_handler![
            check_python_environment,
            search_videos,
            get_stream_url,
            search_channels,
            get_channel_videos,
            play_with_external_player,
            read_binary_file,
            clear_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}
