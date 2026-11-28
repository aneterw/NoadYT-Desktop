# -*- coding: utf-8 -*-
"""Smoke test: APP 啟動時視窗透明→桌面反白 現象量化

流程:
  0. 拍桌面 baseline（全螢幕，供 diff_vs_desktop 參照）
  1. 啟動 noadyt-desktop.exe
  2. 找到 "NoadYT-Desktop" 視窗，取 client 區域（剔除 OS 標題列與邊框）
  3. 每 50ms 量一次：視窗內區域 vs 同位置桌面 baseline 的像素差異
     - diff 低（<18）→ 視窗內容≈桌面 → 透明視窗把桌面透出（反白階段）
     - diff 高（>18）→ WebView2 已繪入 APP 內容
  4. 每 100ms 存一張視窗截圖；內容持續 0.4s 即收工
  5. 產出 report.json（時間軸）+ frames/（截圖）+ contact_sheet.png

用法: py smoke_boot_flash.py
"""
import ctypes
import ctypes.wintypes
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageGrab

ROOT = Path(__file__).resolve().parent
EXE = ROOT / "src-tauri" / "target" / "release" / "noadyt-desktop.exe"
TITLE = "NoadYT-Desktop"
OUT_DIR = ROOT / "smoke_boot_flash_out"

SAMPLE_MS = 50        # 採樣間隔
FRAME_MS = 250        # 截圖間隔（全視窗截圖較慢）
MAX_SECS = 12         # 上限
STABLE_MS = 400       # 內容穩定持續这么久即視為完成
SKIP_TOP = 44         # 剔除 OS 標題列（100% 縮放；高 DPI 時以截圖目視為準）
SKIP_SIDE = 8
SKIP_BOTTOM = 8

user32 = ctypes.windll.user32


def find_windows(title):
    found = []

    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)  # wchar 數（不含 NUL）
        if n == 0:
            return True
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if buf.value == title:
            rect = ctypes.wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            found.append((hwnd, (rect.left, rect.top, rect.right, rect.bottom)))
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return found


METRIC_W = 900
METRIC_H = 600


def crop_int(arr, rect):
    """全視窗截圖取 client 內部區域（視窗本地座標），返回 (crop, valid)"""
    h, w = arr.shape[:2]
    x0, x1 = SKIP_SIDE, w - SKIP_SIDE
    y0, y1 = SKIP_TOP, h - SKIP_BOTTOM
    if x1 - x0 < 20 or y1 - y0 < 20:
        return None, False
    return arr[y0:y1, x0:x1], True


def kill_stale_app():
    """清除殘留 noadyt-desktop 主進程；msedgewebview2 殘留只記錄不殺（避免誤傷其他 app）"""
    out = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq noadyt-desktop.exe", "/FO", "CSV", "/NH"],
        capture_output=True).stdout.decode("cp950", errors="replace")
    pids = [l.split(',')[1].strip('"') for l in out.splitlines()
            if 'noadyt-desktop.exe' in l]
    if pids:
        print(f"    清除殘留 noadyt-desktop 進程: {pids}")
        for pid in pids:
            subprocess.run(["taskkill", "/F", "/PID", pid], capture_output=True)
        time.sleep(1.0)
    wv = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq msedgewebview2.exe", "/FO", "CSV", "/NH"],
        capture_output=True).stdout.decode("cp950", errors="replace").count('msedgewebview2.exe')
    print(f"    msedgewebview2 現有 {wv} 個（殘留過多可能影響 WebView2 初始化）")


def launch_and_baseline():
    """拍桌面 baseline + 啟動 APP，回傳 (proc, base_full, t0)"""
    kill_stale_app()
    stale = find_windows(TITLE)
    if stale:
        print(f"注意: 發現已開啟的 {TITLE} 視窗（{stale[0][1]}），先關閉重測")
        for hwnd, _ in stale:
            user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
        time.sleep(1.5)

    screen = ImageGrab.grab()
    base_full = np.array(screen)
    h, w = base_full.shape[:2]
    print(f"[1] 桌面 baseline: {w}x{h} (monitor)")
    Image.fromarray(base_full).save(OUT_DIR / "desktop_baseline.png")

    log = OUT_DIR / "stdout.log"
    logf = open(log, "wb")
    proc = subprocess.Popen([str(EXE)], cwd=str(EXE.parent),
                            stdout=logf, stderr=subprocess.STDOUT)
    t0 = time.time()
    print(f"[2] 已啟動 {EXE.name} (pid={proc.pid})")
    proc._logf = logf  # 保留句柄供 main 關閉
    return proc, base_full, t0


def sample_metric(rect, base_full):
    """量測視窗 client 中央小區域 vs 同位置桌面 baseline（快，供高頻採樣）

    指標:
      diff_vs_desktop: 像素平均差異（低 = 該處 == 桌面，即透明透出）
      white_pct: 近白像素佔比（>5% 視為白色閃爍階段）
      purple_pct: 紫色 UI 像素佔比（#a855f7 特徵；>0.5% 視為 APP 介面已繪入）
    """
    cx = (rect[0] + rect[2]) // 2
    cy = (rect[1] + rect[3]) // 2
    bx0, by0 = cx - METRIC_W // 2, cy - METRIC_H // 2
    bx1, by1 = cx + METRIC_W // 2, cy + METRIC_H // 2
    mimg = np.array(ImageGrab.grab(bbox=(bx0, by0, bx1, by1)))
    bcrop = base_full[by0:by1, bx0:bx1]
    mm = (min(mimg.shape[0], bcrop.shape[0]), min(mimg.shape[1], bcrop.shape[1]))
    mimg, bcrop = mimg[:mm[0], :mm[1]], bcrop[:mm[0], :mm[1]]
    mimg_i = mimg.astype(int)
    lum = mimg_i.mean(axis=2)
    r, g, b = mimg_i[:, :, 0], mimg_i[:, :, 1], mimg_i[:, :, 2]
    purple = float(((r > 120) & (r < 220) & (g > 40) & (g < 140) & (b > 200)).mean())
    white = float((lum > 200).mean())
    return {
        "diff_vs_desktop": float(np.abs(mimg.astype(np.int16) - bcrop.astype(np.int16))
                                 .mean(axis=(0, 1, 2))),
        "mean_lum": float(mimg.mean()),
        "frac_dark": float((lum < 60).mean()),
        "white_pct": round(white * 100, 3),
        "purple_pct": round(purple * 100, 4),
    }


def write_report(timeline, saved, base_full):
    """寫 report.json + contact sheet；回傳 (report, ui_ms, white_ms)"""
    h, w = base_full.shape[:2]
    # UI 繪入：整張 client 紫色 > 1%（APP 介面特徵）
    first_ui = next((s["t_ms"] for s in timeline
                    if s.get("client_purple_pct", 0) > 1.0), None)
    # 白色閃爍：整張 client 近白 > 5%
    white_samples = [s["t_ms"] for s in timeline if s.get("client_white_pct", 0) > 5]
    white_ms = white_samples[0] if white_samples else None
    # 桌面透出（透明階段）：diff < 5 的樣本
    desktop_samples = [s["t_ms"] for s in timeline if s["diff_vs_desktop"] < 5]
    last_desktop = desktop_samples[-1] if desktop_samples else None
    report = {
        "exe": str(EXE),
        "monitor_px": [w, h],
        "samples": len(timeline),
        "first_ui_ms": first_ui,
        "first_white_flash_ms": white_ms,
        "last_desktop_visible_ms": last_desktop,
        "white_flash_samples_ms": white_samples,
        "timeline": [
            {k: (round(v, 3) if isinstance(v, float) else v)
             for k, v in s.items()} for s in timeline
        ],
        "frames": saved,
    }
    with open(OUT_DIR / "report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    frames_dir = OUT_DIR / "frames"
    step = max(1, len(saved) // 12)
    thumbs = []
    for name in saved[::step][:12]:
        t = Image.open(frames_dir / name).convert("RGB")
        t.thumbnail((400, 270))
        thumbs.append(t)
    if thumbs:
        cols = 2
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 400, rows * 270), "gray")
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % cols) * 400 + 400 - t.width,
                            (i // cols) * 270))
        sheet.save(OUT_DIR / "contact_sheet.png")
    print(f"[3] 完成: 樣本數={len(timeline)}, UI 繪入 t={first_ui}ms, "
          f"白閃 t={white_ms}ms, 桌面透出最後樣本 t={last_desktop}ms")
    print(f"    報告: {OUT_DIR / 'report.json'}")
    return report, first_ui, white_ms


def main():
    if not EXE.exists():
        print(f"EXE not found: {EXE}")
        sys.exit(1)

    OUT_DIR.mkdir(exist_ok=True)
    frames_dir = OUT_DIR / "frames"
    frames_dir.mkdir(exist_ok=True)
    for old in frames_dir.iterdir():
        old.unlink()

    proc, base_full, t0 = launch_and_baseline()

    timeline = []
    saved = []
    win_found_at = None
    last_frame_at = -1.0
    last_content_at = None
    win_ms_reported = None

    try:
        while time.time() - t0 < MAX_SECS:
            now = time.time()
            wins = find_windows(TITLE)
            if not wins:
                time.sleep(0.005)
                continue
            hwnd, rect = wins[0]
            if win_found_at is None:
                win_found_at = now - t0
            int_now = now - t0

            m = sample_metric(rect, base_full)
            m["t_ms"] = round(int_now * 1000)
            m["win_ms"] = round(win_found_at * 1000)
            timeline.append(m)
            if win_ms_reported is None:
                win_ms_reported = m["win_ms"]

            # 每 FRAME_MS 存一張全視窗截圖（目視用），並量 client 整體紫色/白色佔比
            if int_now - last_frame_at >= FRAME_MS / 1000:
                last_frame_at = int_now
                p = frames_dir / f"f_{int_now*1000:06.0f}.png"
                img = ImageGrab.grab(bbox=rect)
                img.save(p)
                saved.append(p.name)
                fa = np.array(img.convert("RGB")).astype(int)
                fc = fa[SKIP_TOP:-SKIP_BOTTOM, SKIP_SIDE:-SKIP_SIDE]  # client 區
                lumc = fc.mean(axis=2)
                rr, gg, bb = fc[:, :, 0], fc[:, :, 1], fc[:, :, 2]
                m["client_purple_pct"] = round(float(((rr > 120) & (rr < 220)
                                                      & (gg > 40) & (gg < 140) & (bb > 200)).mean()) * 100, 3)
                m["client_white_pct"] = round(float((lumc > 200).mean()) * 100, 3)

            # client 整體紫色 >1% = 介面已繪入；持續 STABLE_MS 即收工，否則跑滿 MAX_SECS
            if m.get("client_purple_pct", 0) > 1.0:
                if last_content_at is None:
                    last_content_at = int_now
            else:
                last_content_at = None
            if last_content_at is not None and int_now - last_content_at >= STABLE_MS / 1000:
                break
            time.sleep(SAMPLE_MS / 1000)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        if hasattr(proc, "_logf"):
            proc._logf.close()

    report, ui_ms, white_ms = write_report(timeline, saved, base_full)
    report["win_found_ms"] = win_ms_reported
    report["win_rect"] = list(rect) if 'rect' in dir() else None
    with open(OUT_DIR / "report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"    視窗出現 t={win_ms_reported}ms, UI 繪入 t={ui_ms}ms, 白閃 t={white_ms}ms")


if __name__ == "__main__":
    main()
