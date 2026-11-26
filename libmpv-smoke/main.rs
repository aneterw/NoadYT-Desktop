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
    let mut youtube_id: Option<String> = None;
    let mut wait_secs: u64 = 20;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--wait-seconds" => {
                i += 1;
                if i < args.len() {
                    wait_secs = args[i].parse().unwrap_or(20);
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
        eprintln!("用法: libmpv-smoke <video_url> [audio_url] [--wait-seconds N]\n      libmpv-smoke youtube <video_id>");
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
    let initial_bytes = c_str(
        r#"{"hwdec":"auto-safe","force-window":"yes","keep-open":"no","user-agent":"Mozilla/5.0","referrer":"https://www.youtube.com"}"#,
    );
    let observed = c_str("{}");
    println!("[2] 建立 mpv 實例...");
    let handle = unsafe {
        create(
            initial_bytes.as_ptr(),
            observed.as_ptr(),
            Some(event_callback),
            std::ptr::null_mut(),
        )
    };
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

    // ── 6. 播放觀察 ──
    println!("[6] 播放 {wait_secs} 秒，統計 video-reconfig / audio-reconfig ...");
    thread::sleep(Duration::from_secs(wait_secs));

    let n_video = VIDEO_RECONFIG.load(Ordering::SeqCst);
    let n_audio = AUDIO_RECONFIG.load(Ordering::SeqCst);

    for prop in ["video-format", "audio-format", "pause"] {
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
