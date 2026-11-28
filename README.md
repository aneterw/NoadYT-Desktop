# NoadYT-Desktop

| 🇹🇼 繁體中文 | 🇺🇸 English |
|---|---|
| 基於 Tauri 2 + React + Python (yt-dlp) 的桌面 YouTube 播放器，支援影片搜尋、頻道搜尋、內建 libmpv 播放與字幕同步下載。 | A desktop YouTube player built with Tauri 2 + React + Python (yt-dlp), featuring video search, channel search, built-in libmpv playback, and synchronized subtitle download. |

---

## 功能特色 / Features

| 🇹🇼 繁體中文 | 🇺🇸 English |
|---|---|
| 🔍 **影片搜尋**：以關鍵字搜尋 YouTube 影片，回傳單集影片清單（標題、縮圖、長度、觀看數） | 🔍 **Video Search**: Search YouTube videos by keyword; returns a list of individual videos (title, thumbnail, duration, view count) |
| 📺 **頻道搜尋**：以關鍵字搜尋 YouTube 頻道，點選頻道卡片後可瀏覽該頻道最新影片清單 | 📺 **Channel Search**: Search YouTube channels by keyword; click a channel card to browse its latest videos |
| 🎬 **內建播放器**：libmpv 嵌入播放（GPU 硬體解碼），或切換至外部播放器（PotPlayer / VLC / MPV） | 🎬 **Built-in Player**: Embedded libmpv (GPU hardware decode), or switch to external players (PotPlayer / VLC / MPV) |
| 📝 **字幕支援**：自動下載並顯示字幕，支援 TimedText 和 YouTube Transcript API，TimedText 優先 | 📝 **Subtitles**: Auto-download and display subtitles; supports TimedText and YouTube Transcript API (TimedText preferred) |
| 🎨 **字幕自訂**：調整字幕大小（12–64px）、字體顏色（黃色）、背景透明度（75%） | 🎨 **Subtitle Customization**: Adjustable size (12–64px), color (yellow), and background opacity (75%) |
| 💾 **緩存管理**：清除下載與字幕快取 | 💾 **Cache Management**: Clear download and subtitle caches |
| ⌨️ **快捷鍵**：空白鍵播放/暫停、←→ 前後跳 10 秒、↑↓ 音量、F 全螢幕 | ⌨️ **Shortcuts**: Space play/pause, ←/→ seek 10s, ↑/↓ volume, F fullscreen |

---

## 搜尋：影片 vs 頻道 / Search: Video vs Channel

兩種搜尋模式意義不同 / Two search modes with different purposes:

| | 🇹🇼 影片搜尋 / Video Search | 🇺🇸 頻道搜尋 / Channel Search |
|---|---|---|
| **搜尋對象 / Target** | 單集影片（Video） | YouTube 頻道／創作者（Channel） |
| **回傳結果 / Results** | 影片清單：標題、縮圖、長度、觀看數 | 頻道清單：頻道名、訂閱數、縮圖 |
| **使用情境 / Use Case** | 知道「要看的內容」→ 直接找那支影片 | 知道「要追蹤的創作者」→ 找該頻道，再瀏覽其最新發布 |
| **結果頁操作 / After Results** | 點選影片縮圖 → 直接播放 | 點選頻道卡片 → 進入頻道頁 → 瀏覽最新 N 支影片 |

**操作方式相同 / Same operation**：輸入關鍵字 → 切換「影片／頻道」標籤 → 點擊「搜尋」。
Enter keyword → switch to "Video / Channel" tab → click "Search".

---

## 安裝方法 / Installation

### 從 GitHub 下載 / Download from GitHub

🇹🇼 前往 [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) 頁面下載最新的 MSI 安裝程序。
🇺🇸 Go to [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) and download the latest MSI installer.

```
NoadYT-Desktop_0.8.0_x64.msi
```

### 系統需求 / System Requirements

| 項目 / Item | 需求 / Requirement |
|---|---|
| 作業系統 / OS | Windows 10/11 |
| Python | 3.12（含 `yt-dlp` 和 `youtube_transcript_api`） |
| WebView2 | Windows 內建或自行安裝 |

### 安裝步驟 / Installation Steps

1. 下載 `NoadYT-Desktop_0.8.0_x64.msi` / Download the MSI
2. 雙擊運行安裝程序 / Double-click to run the installer
3. 按照嚮導完成安裝 / Follow the wizard to complete installation
4. 啟動應用程式即可使用 / Launch the app to start using it

---

## 使用說明 / Usage

### 搜尋影片 / Search Videos

1. 切換到「影片」標籤 / Switch to the "Video" tab
2. 輸入關鍵字（例：`24h live news`、`日語教學`）/ Enter a keyword
3. 點擊「搜尋」或按 Enter / Click "Search" or press Enter
4. 點擊任一影片縮圖即可播放 / Click any video thumbnail to play

### 搜尋頻道 / Search Channels

1. 切換到「頻道」標籤 / Switch to the "Channel" tab
2. 輸入關鍵字（例：`BBC News`、`跳脫舒適圈`）/ Enter a keyword
3. 點擊「搜尋」或按 Enter / Click "Search" or press Enter
4. 結果為頻道卡片（頻道名、訂閱數）/ Results show channel cards (name, subscriber count)
5. 點擊頻道卡片 → 進入該頻道最新影片清單 / Click a channel card → browse its latest videos
6. 點擊影片即可播放 / Click a video to play

### 播放影片與字幕 / Play Video & Subtitles

1. 點擊影片縮圖進入播放頁面 / Click a video thumbnail to enter the player
2. 影片自動串流播放 / Video streams automatically
3. 如有可用字幕，會自動顯示在畫面底部 / Subtitles appear at the bottom if available
4. 使用「字幕大小」滑塊調整（12–64px）/ Use the size slider to adjust (12–64px)

### 播放器快捷鍵 / Player Shortcuts

| 按鍵 / Key | 功能 / Function |
|---|---|
| 空白鍵 / Space | 播放 / 暫停 · Play / Pause |
| ← → | 前後跳 10 秒 · Seek 10s |
| ↑ ↓ | 調整音量 · Volume |
| F | 全螢幕 / 退出全螢幕 · Fullscreen toggle |

### 設定 / Settings

可調整項目 / Adjustable options:
- 搜尋結果數量 / Search result count
- 預設解析度（自動 / 1080P / 720P / 480P）/ Default resolution
- 播放器選擇（內建 / 外部）/ Player selection (built-in / external)
- 字幕語言優先順序 / Subtitle language priority
- 清除緩存 / Clear cache

---

## 快速開始 / Quick Start

### 方法一：直接安裝 MSI（推薦）/ Method 1: Install MSI (Recommended)

1. 下載 `NoadYT-Desktop_0.8.0_x64.msi` / Download the MSI
2. 雙擊安裝 / Double-click to install
3. 啟動應用程式 / Launch the app
4. 輸入關鍵字搜尋 → 點擊影片播放 / Search → click a video to play

約 2–3 分鐘完成，無需手動配置環境。/ Completes in 2–3 minutes, no manual setup needed.

### 方法二：從源代碼編譯 / Method 2: Build from Source

```bash
git clone https://github.com/aneterw/NoadYT-Desktop.git
cd NoadYT-Desktop
npm install
pip install yt-dlp youtube_transcript_api

# 開發模式 / Dev mode
npm run dev

# 構建 MSI / Build MSI
npm run build
npx tauri build
```

構建產出 / Build output:
```
src-tauri/target/release/bundle/msi/NoadYT-Desktop_0.8.0_x64.msi
```

---

## 專案結構 / Project Structure

```
NoadYT-Desktop/
├── src/                    # 前端 React 源代碼 / Frontend React source
│   ├── pages/
│   │   ├── Home.tsx        # 主頁面（搜尋+影片/頻道標籤）/ Main page
│   │   ├── ChannelVideos.tsx  # 頻道影片清單頁 / Channel video list
│   │   └── VideoPlayer.tsx    # 內建播放器頁 / Built-in player
│   ├── components/         # 共用組件 / Shared components
│   └── lib/                # 工具函式 / Utility functions
├── src-tauri/              # 後端 Rust 源代碼 / Backend Rust source
│   ├── src/main.rs         # Tauri 命令處理 / Tauri command handlers
│   ├── tauri.conf.json     # Tauri 配置 / Tauri config
│   └── resources/python/
│       └── youtube_extractor.py  # Python 提取腳本 / Python extractor
├── python/                 # Python 源碼（與 resources 同步）
└── package.json
```

## 技術棧 / Tech Stack

| 層 / Layer | 技術 / Technology |
|---|---|
| 前端 / Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| 桌面框架 / Desktop | Tauri 2 (Rust) |
| 播放器 / Player | libmpv（GPU 硬體解碼）/ libmpv (GPU hardware decode) |
| 後端 / Backend | Python + yt-dlp + youtube_transcript_api |

---

## 授權 / License

本項目採用 [MIT License](LICENSE) / This project is licensed under the [MIT License](LICENSE).

## 貢獻 / Contributing

歡迎提交 Issue 和 Pull Request / Issues and PRs are welcome.

---

Made with ❤️ by NoadYT-Desktop
