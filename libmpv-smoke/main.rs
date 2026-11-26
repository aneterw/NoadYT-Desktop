//! libmpv smoke test（獨立、不經 Tauri，純 Rust + libloading）
//!
//! 目的：確認 src-tauri/lib/ 的兩支 DLL 真的能初始化 libmpv，
//! 並正確接收「影像 URL + 音訊 URL」進行播放（黑屏排障）。
//!
//! 用法：
//!   libmpv-smoke <video_url> [audio_url] [--wait-seconds N]
//!   libmpv-smoke youtube <video_id>          # 直接餵 YouTube 正式網址

use std::env;
use std::ffi::{c_void, CStr, CString};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;
use std::time::Duration;

type FnFree = unsafe extern "C" fn(*mut i8);
type FnCreate =
    unsafe extern "C" fn(
        *const i8,
        *const i8,
        Option<unsafe extern "C" fn(*const i8, *mut c_void)>,
        *mut c_void,
    ) -> *mut c_void;
type FnDestroy = unsafe extern "C" fn(*mut c_void);
type FnCmd = unsafe extern "C" fn(*mut c_void, *const i8, *const i8) -> *mut i8;

/// 事件回調需要的 free 函式指針（載入 DLL 後覆寫；mpv 線程讀取，故用 AtomicPtr）
static FREE: std::sync::atomic::AtomicPtr<u8> = std::sync::atomic::AtomicPtr::new(std::ptr::null_mut());
/// video-reconfig 事件計數（有觸發 = 畫面有出來）
static VIDEO_RECONFIG: AtomicU32 = AtomicU32::new(0);
static AUDIO_RECONFIG: AtomicU32 = AtomicU32::new(0);

extern "C" fn event_callback(event: *const i8, _userdata: *mut c_void) {
    if event.is_null() {
        return;
    }
    let text = unsafe { CStr::from_ptr(event).to_string_lossy().into_owned() };
    let free_ptr = FREE.load(Ordering::SeqCst);
    if !free_ptr.is_null() {
        let free: FnFree = unsafe { std::mem::transmute::<*mut u8, FnFree>(free_ptr) };
        unsafe { free(event as *mut i8) };
    }

    if text.contains("\"video-reconfig\"") {
        VIDEO_RECONFIG.fetch_add(1, Ordering::SeqCst);
        println!("[EVENT] video-reconfig（畫面出來）: {}", &text[..text.len().min(200)]);
    }
    if text.contains("\"audio-reconfig\"") {
        AUDIO_RECONFIG.fetch_add(1, Ordering::SeqCst);
        println!("[EVENT] audio-reconfig（音訊載入）: {}", &text[..text.len().min(200)]);
    }
    if text.contains("\"end-file\"") {
        println!("[EVENT] end-file: {}", &text[..text.len().min(300)]);
    }
    if text.contains("\"log-message\"") && (text.contains("\"error\"") || text.contains("403")) {
        println!("[LOG ] {}", &text[..text.len().min(300)]);
    }
}

/// 依序找 libmpv-wrapper.dll：專案 src-tauri/lib/ → exe 同目錄 → exe/lib/
fn find_wrapper_dll() -> String {
    let mut dirs: Vec<PathBuf> = vec![];
    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
            let mut cur = dir.to_path_buf();
            for _ in 0..8 {
                dirs.push(cur.clone());
                match cur.parent() {
                    Some(p) => cur = p.to_path_buf(),
                    None => break,
                }
            }
        }
    }
    if let Ok(cwd) = env::current_dir() {
        dirs.push(cwd.to_path_buf());
    }
    for dir in &dirs {
        for candidate in [
            dir.join("src-tauri/lib/libmpv-wrapper.dll"),
            dir.join("lib/libmpv-wrapper.dll"),
            dir.join("libmpv-wrapper.dll"),
        ] {
            if candidate.exists() {
                return candidate.to_string_lossy().into_owned();
            }
        }
    }
    "libmpv-wrapper.dll".to_string()
}

fn c_str(s: &str) -> CString {
    CString::new(s).unwrap_or_else(|_| CString::new("").unwrap())
}

/// 最小 JSON 字串轉義
fn json_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// 取 C 函式回傳的字串並 free
fn take_cstr(free: FnFree, ptr: *mut i8) -> String {
    if ptr.is_null() {
        return "<null>".to_string();
    }
    let s = unsafe { CStr::from_ptr(ptr as *const i8).to_string_lossy().into_owned() };
    unsafe { free(ptr) };
    s
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut video_url: Option<String> = None;
    let mut audio_url: Option<String> = None;
    let mut sub_path: Option<String> = None;
    let mut user_agent: Option<String> = None;
    let mut youtube_id: Option<String> = None;
    let mut fonts_dir: String = String::new();
    let mut wait_secs: u64 = 20;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--fonts" => {
                i += 1;
                if i < args.len() {
                    fonts_dir = args[i].clone();
                }
            }
            "--wait-seconds" => {
                i += 1;
                if i < args.len() {
                    wait_secs = args[i].parse().unwrap_or(20);
                }
            }
            "--user-agent" => {
                i += 1;
                if i < args.len() {
                    user_agent = Some(args[i].clone());
                }
            }
            "--sub" => {
                i += 1;
                if i < args.len() {
                    sub_path = Some(args[i].clone());
                }
            }
            "youtube" => {
                i += 1;
                if i < args.len() {
                    youtube_id = Some(args[i].clone());
                }
            }
            s if s.starts_with("http") => match (video_url.is_none(), audio_url.is_none()) {
                (true, _) => video_url = Some(s.to_string()),
                _ => audio_url = Some(s.to_string()),
            },
            _ => {}
        }
        i += 1;
    }

    if let Some(id) = youtube_id {
        video_url = Some(format!("https://www.youtube.com/watch?v={id}"));
        println!("ℹ️ YouTube 模式：mpv 需內含 ytdl-lua 才能解析正式網址\n");
    }
    let Some(video_url) = video_url else {
        eprintln!("用法: libmpv-smoke <video_url> [audio_url] [--user-agent UA] [--wait-seconds N]\n      libmpv-smoke youtube <video_id>");
        std::process::exit(2);
    };
    let audio_url = audio_url.unwrap_or_default();

    // ── 1. 載入 wrapper DLL（libmpv-2.dll 必須與之同目錄） ──
    let dll_path = find_wrapper_dll();
    println!("[1] 載入 libmpv-wrapper: {dll_path}");
    let lib = match unsafe { libloading::Library::new(&dll_path) } {
        Ok(l) => l,
        Err(e) => {
            eprintln!("❌ 載入失敗: {e:?}");
            eprintln!("   可能原因：libmpv-2.dll 不在 {dll_path} 同目錄，或相依缺少");
            std::process::exit(1);
        }
    };

    let free: FnFree = unsafe { *lib.get(b"mpv_wrapper_free\0").expect("缺少 mpv_wrapper_free") };
    FREE.store(free as *mut u8, Ordering::SeqCst);
    let create: FnCreate =
        unsafe { *lib.get(b"mpv_wrapper_create\0").expect("缺少 mpv_wrapper_create") };
    let destroy: FnDestroy = unsafe { *lib.get(b"mpv_wrapper_destroy\0").expect("缺少 destroy") };
    let command: FnCmd = unsafe { *lib.get(b"mpv_wrapper_command\0").expect("缺少 command") };
    let set_property: FnCmd =
        unsafe { *lib.get(b"mpv_wrapper_set_property\0").expect("缺少 set_property") };
    let get_property: FnCmd =
        unsafe { *lib.get(b"mpv_wrapper_get_property\0").expect("缺少 get_property") };

    // ── 2. 建立 mpv 實例 ──
    let ua = user_agent.unwrap_or_else(|| "Mozilla/5.0".to_string());
    let initial_json = if fonts_dir.is_empty() {
        format!(
            r#"{{"hwdec":"auto-safe","force-window":"yes","keep-open":"no","user-agent":"{}","referrer":"https://www.youtube.com"}}"#,
            json_escape(&ua)
        )
    } else if fonts_dir == "FONTDIR" {
        // 正確選項名：font-dir（fonts 是「列出」屬性，不是載入選項）
        format!(
            r#"{{"hwdec":"auto-safe","force-window":"yes","keep-open":"no","user-agent":"{}","referrer":"https://www.youtube.com","font-dir":"C:\\Windows\\Fonts"}}"#,
            json_escape(&ua)
        )
    } else {
        format!(
            r#"{{"hwdec":"auto-safe","force-window":"yes","keep-open":"no","user-agent":"{}","referrer":"https://www.youtube.com","fonts":"{}"}}"#,
            json_escape(&ua),
            json_escape(&fonts_dir)
        )
    };
    let initial_bytes = c_str(&initial_json);
    let observed = c_str("{}");
    let has_fonts = if fonts_dir.is_empty() { "無".to_string() } else { "有".to_string() };
    println!("[2] 建立 mpv 實例（user-agent: {}..., fonts: {}）...", ua.chars().take(40).collect::<String>(), has_fonts);
    let create_started = std::time::Instant::now();
    let handle = unsafe {
        create(
            initial_bytes.as_ptr(),
            observed.as_ptr(),
            Some(event_callback),
            std::ptr::null_mut(),
        )
    };
    println!("    create 耗時 {} ms", create_started.elapsed().as_millis());
    if handle.is_null() {
        eprintln!("❌ mpv_wrapper_create 回傳 NULL");
        eprintln!("   可能原因：libmpv-2.dll 沒被一起載入（要與 wrapper 同目錄）、或 DLL 版本不符");
        std::process::exit(1);
    }
    println!("[2] ✅ libmpv 實例建立成功（代表兩支 DLL 都正常）");

    let run_cmd = |name: &str, args_json: &str| {
        let c_name = c_str(name);
        let c_args = c_str(args_json);
        let r = unsafe { command(handle, c_name.as_ptr(), c_args.as_ptr()) };
        let txt = take_cstr(free, r);
        println!("    cmd {name} {args_json} => {txt}");
    };

    let run_set = |name: &str, value_json: &str| {
        let c_name = c_str(name);
        let c_val = c_str(value_json);
        let r = unsafe { set_property(handle, c_name.as_ptr(), c_val.as_ptr()) };
        let txt = take_cstr(free, r);
        println!("    set {name} = {value_json} => {txt}");
    };

    let v_json = json_escape(&video_url);
    let a_json = json_escape(&audio_url);
    let loadfile_args = format!("[\"{v_json}\", \"replace\"]");
    let audio_add_args = format!("[\"{a_json}\", \"select\"]");
    let audio_files_val = format!("[{a_json}]");

    // ── 3. 預掛音訊（audio-files） ──
    if !audio_url.is_empty() {
        println!("[3] 預設 audio-files（音訊 URL）...");
        run_set("audio-files", &audio_files_val);
    }

    // ── 4. loadfile 影像 URL ──
    println!("[4] loadfile 影像 URL...");
    run_cmd("loadfile", &loadfile_args);

    // file-loaded 之後再補一次 audio-add（照 mpv 文件，避免分隔符截斷）
    thread::sleep(Duration::from_secs(2));
    if !audio_url.is_empty() {
        println!("[5] audio-add（select）...");
        run_cmd("audio-add", &audio_add_args);
    }

    // ── 5b. 字幕：sub-add 本地 vtt ──
    if let Some(sub) = &sub_path {
        let sub_args = format!("[\"{}\", \"select\"]", json_escape(sub));
        println!("[5b] sub-add（select）...");
        run_cmd("sub-add", &sub_args);
        thread::sleep(Duration::from_secs(1));
    }

    // ── 5c. 控制通道實測：比較 command('set') 與 set_property 兩種寫法 ──
    let get_prop = |prop: &str, fmt: &str| -> String {
        let c_name = c_str(prop);
        let c_fmt = c_str(fmt);
        let r = unsafe { get_property(handle, c_name.as_ptr(), c_fmt.as_ptr()) };
        let s = take_cstr(free, r);
        // 簡化顯示：{"data":"..."} 只留 content
        s.trim().trim_start_matches('{').trim_end_matches('}')
            .split_once(':')
            .map(|(_, v)| v.trim().trim_matches('"').to_string())
            .unwrap_or(s)
    };
    println!("[5c] 控制通道實測...");
    thread::sleep(Duration::from_secs(2));

    // 暫停（command set / set_property 兩條路都試）
    let pause_before = get_prop("pause", "flag");
    run_cmd("set", r#"["pause", true]"#);
    thread::sleep(Duration::from_millis(500));
    let pause_via_cmd = get_prop("pause", "flag");
    run_set("pause", "false");
    thread::sleep(Duration::from_millis(500));
    let pause_via_setprop = get_prop("pause", "flag");
    println!(
        "    pause: before={} → cmd set=true→{} → set_property=false→{}",
        pause_before, pause_via_cmd, pause_via_setprop
    );

    // 音量
    run_cmd("set", r#"["volume", 40]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    volume: set 40 → 讀回 {}", get_prop("volume", "string"));

    // 音訊延遲
    run_cmd("set", r#"["audio-delay", 0.5]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    audio-delay: set 0.5 → 讀回 {}", get_prop("audio-delay", "string"));

    // 剩餘時間（double 讀取是否可讀）
    println!("    remaining: {}", get_prop("remaining", "double"));
    println!("    time-pos: {}", get_prop("time-pos", "double"));

    // 字幕屬性（大小/顏色/背景/開關）
    run_cmd("set", r#"["sub-font-size", 30]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-font-size: set 30 → 讀回 {}", get_prop("sub-font-size", "string"));
    run_cmd("set", r##"["sub-color", "#ff0000"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-color: set #ff0000 → 讀回 {}", get_prop("sub-color", "string"));
    run_cmd("set", r##"["sub-back-color", "#00ff00"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-back-color: set #00ff00 → 讀回 {}", get_prop("sub-back-color", "string"));
    // 8 位 hex 順序實測：AARRGGBB（alpha 前）vs RRGGBBAA（alpha 後），看讀回值判定
    run_cmd("set", r##"["sub-back-color", "#99ff0000"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-back-color: set #99FF0000(AARRGGBB=綠60%透明) → 讀回 {}", get_prop("sub-back-color", "string"));
    run_cmd("set", r##"["sub-use-embedded-styles", "no"]"##);
    thread::sleep(Duration::from_millis(200));
    println!("    sub-use-embedded-styles: set no → 讀回 {}", get_prop("sub-use-embedded-styles", "string"));
    run_cmd("set", r##"["sub-back-color", "#99ff0000"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    重設 sub-back-color #99FF0000 → 讀回 {}", get_prop("sub-back-color", "string"));
    run_cmd("set", r#"["sub", "no"]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    sub: set no → 讀回 {}", get_prop("sub", "flag"));
    run_cmd("set", r#"["sub", "yes"]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    sub: set yes → 讀回 {}", get_prop("sub", "flag"));
    println!("    sub-track: {}", get_prop("sub", "string"));
    println!("    sid: {}", get_prop("sid", "string"));

    // ── 5d. set_property 布林值 + 系統字體清單 ──
    println!("[5d] set_property 布林值與字體...");
    run_set("pause", "true");
    thread::sleep(Duration::from_millis(300));
    println!("    set_property pause=true → 讀回 {}", get_prop("pause", "flag"));
    run_set("sub", "true");
    thread::sleep(Duration::from_millis(300));
    println!("    set_property sub=true → 讀回 {}", get_prop("sub", "flag"));
    {
        let c_name = c_str("fonts");
        let c_fmt = c_str("node");
        let r = unsafe { get_property(handle, c_name.as_ptr(), c_fmt.as_ptr()) };
        let s = take_cstr(free, r);
        let quotes = s.bytes().filter(|&b| b == b'"').count();
        println!("    fonts(node) 長度={} 約 {} 支字型", s.len(), quotes / 2);
    }

    // ── 5f. sub-font 實測：指定字型後讀回 ──
    println!("[5f] sub-font 實測（fonts=C:\\Windows\\Fonts）...");
    run_cmd("set", r#"["sub-font", "Sans"]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-font: set Sans → 讀回 {}", get_prop("sub-font", "string"));
    run_cmd("set", r##"["sub-font", "Microsoft JhengHei"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-font: set 'Microsoft JhengHei' → 讀回 {}", get_prop("sub-font", "string"));
    run_cmd("set", r##"["sub-font", "DengXian"]"##);
    thread::sleep(Duration::from_millis(300));
    println!("    sub-font: set 'DengXian' → 讀回 {}", get_prop("sub-font", "string"));

    // ── 5e. 字幕開關的各寫法實測 ──
    println!("[5e] 字幕開關寫法實測...");
    run_cmd("set", r#"["sub", 1]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    cmd sub=1(int) => 讀回 {}", get_prop("sub", "string"));
    run_cmd("set", r#"["sub", 0]"#);
    thread::sleep(Duration::from_millis(300));
    println!("    cmd sub=0(int) => 讀回 {}", get_prop("sub", "string"));
    run_cmd("sub-toggle", "[]");
    thread::sleep(Duration::from_millis(300));
    println!("    cmd sub-toggle => 讀回 {}", get_prop("sub", "string"));
    run_set("sub", "1");
    thread::sleep(Duration::from_millis(300));
    println!("    set_property sub=1 => 讀回 {}", get_prop("sub", "string"));

    // ── 5g. init 後才設 fonts（不擋初始化），驗證載入耗时與後續指令是否仍可動作 ──
    println!("[5g] init 後設 fonts=C:\\Windows\\Fonts...");
    let t0 = std::time::Instant::now();
    run_set("fonts", r#""C:\Windows\Fonts""#);
    println!("    set_property fonts 耗時 {} ms", t0.elapsed().as_millis());
    thread::sleep(Duration::from_secs(1));
    let c_fonts = c_str("fonts");
    let c_node = c_str("node");
    let r = unsafe { get_property(handle, c_fonts.as_ptr(), c_node.as_ptr()) };
    let s = take_cstr(free, r);
    let q = s.bytes().filter(|&b| b == b'"').count();
    println!("    讀回 fonts(node) 約 {} 支字型", q / 2);
    run_cmd("set", r#"["pause", true]"#);
    println!("    後續指令 pause → 讀回 {}", get_prop("pause", "flag"));
    run_set("pause", "false");

    // ── 6. 播放觀察 ──
    println!("[6] 播放 {wait_secs} 秒，統計 video-reconfig / audio-reconfig ...");
    thread::sleep(Duration::from_secs(wait_secs));

    let n_video = VIDEO_RECONFIG.load(Ordering::SeqCst);
    let n_audio = AUDIO_RECONFIG.load(Ordering::SeqCst);

    for prop in ["video-format", "audio-format", "sub", "sid", "pause"] {
        let c_name = c_str(prop);
        let c_fmt = c_str("string");
        let r = unsafe { get_property(handle, c_name.as_ptr(), c_fmt.as_ptr()) };
        println!("    property {prop} => {}", take_cstr(free, r));
    }

    println!("\n=== 判定 ===");
    println!("video-reconfig={n_video}  audio-reconfig={n_audio}");
    if n_video > 0 {
        println!("✅ libmpv 畫面有出來（video-reconfig 觸發過）");
    } else {
        println!("⚠️ 沒有 video-reconfig —— 黑屏。可能：URL 被 YouTube 擋（user-agent 沒生效）、解碼器或硬體問題");
    }
    if !audio_url.is_empty() && n_audio == 0 {
        println!("⚠️ 沒有 audio-reconfig —— 音訊沒掛上");
    }

    unsafe { destroy(handle) };
    println!("\n[7] mpv 實例已關閉，測試結束。");
}
