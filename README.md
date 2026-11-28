# NoadYT-Desktop

**語言 / Language**: [🇹🇼 繁體中文](#繁體中文) | [🇺🇸 English](#english)

---

## 🇹🇼 繁體中文

NoadYT-Desktop 是一個基於 Tauri 2 + React + Python (yt-dlp) 的桌面 YouTube 播放器，支援影片搜尋、頻道搜尋、內建 libmpv 播放與字幕同步下載。

### 功能特色

- 🔍 **影片搜尋**：以關鍵字搜尋 YouTube 影片，回傳單集影片清單（標題、縮圖、長度、觀看數）
- 📺 **頻道搜尋**：以關鍵字搜尋 YouTube 頻道，點選頻道卡片後可瀏覽該頻道最新影片清單
- 🎬 **內建播放器**：libmpv 嵌入播放（GPU 硬體解碼），或切換至外部播放器（PotPlayer / VLC / MPV）
- 📝 **字幕支援**：自動下載並顯示字幕，支援 TimedText 和 YouTube Transcript API，TimedText 優先
- 🎨 **字幕自訂**：調整字幕大小（12–64px）、字體顏色（黃色）、背景透明度（75%）
- 💾 **緩存管理**：清除下載與字幕快取
- ⌨️ **快捷鍵**：空白鍵播放/暫停、←→ 前後跳 10 秒、↑↓ 音量、F 全螢幕

### 搜尋：影片 vs 頻道

兩種搜尋模式意義不同：

| | 影片搜尋 | 頻道搜尋 |
|---|---|---|
| **搜尋對象** | 單集影片（Video） | YouTube 頻道／創作者（Channel） |
| **回傳結果** | 影片清單：標題、縮圖、長度、觀看數 | 頻道清單：頻道名、訂閱數、縮圖 |
| **使用情境** | 知道「要看的內容」→ 直接找那支影片 | 知道「要追蹤的創作者」→ 找該頻道，再瀏覽其最新發布 |
| **結果頁操作** | 點選影片縮圖 → 直接播放 | 點選頻道卡片 → 進入頻道頁 → 瀏覽最新 N 支影片 |

**操作方式相同**：輸入關鍵字 → 切換「影片／頻道」標籤 → 點擊「搜尋」。

### 安裝方法

#### 從 GitHub 下載

前往 [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) 頁面下載最新的 MSI 安裝程序：

```
NoadYT-Desktop_0.8.0_x64.msi
```

#### 系統需求

| 項目 | 需求 |
|---|---|
| 作業系統 | Windows 10/11 |
| Python | 3.12（含 `yt-dlp` 和 `youtube_transcript_api`） |
| WebView2 | Windows 內建或自行安裝 |

#### 安裝步驟

1. 下載 `NoadYT-Desktop_0.8.0_x64.msi`
2. 雙擊運行安裝程序
3. 按照嚮導完成安裝
4. 啟動應用程式即可使用

### 使用說明

#### 搜尋影片

1. 切換到「影片」標籤
2. 輸入關鍵字（例：`24h live news`、`日語教學`）
3. 點擊「搜尋」或按 Enter
4. 點擊任一影片縮圖即可播放

#### 搜尋頻道

1. 切換到「頻道」標籤
2. 輸入關鍵字（例：`BBC News`、`跳脫舒適圈`）
3. 點擊「搜尋」或按 Enter
4. 結果為頻道卡片（頻道名、訂閱數）
5. 點擊頻道卡片 → 進入該頻道最新影片清單
6. 點擊影片即可播放

#### 播放影片與字幕

1. 點擊影片縮圖進入播放頁面
2. 影片自動串流播放
3. 如有可用字幕，會自動顯示在畫面底部
4. 使用「字幕大小」滑塊調整（12–64px）

#### 播放器快捷鍵

| 按鍵 | 功能 |
|---|---|
| 空白鍵 | 播放 / 暫停 |
| ← → | 前後跳 10 秒 |
| ↑ ↓ | 調整音量 |
| F | 全螢幕 / 退出全螢幕 |

#### 設定

可調整項目：
- 搜尋結果數量
- 預設解析度（自動 / 1080P / 720P / 480P）
- 播放器選擇（內建 / 外部）
- 字幕語言優先順序
- 清除緩存

### 快速開始

#### 方法一：直接安裝 MSI（推薦）

1. 下載 `NoadYT-Desktop_0.8.0_x64.msi`
2. 雙擊安裝
3. 啟動應用程式
4. 輸入關鍵字搜尋 → 點擊影片播放

約 2–3 分鐘完成，無需手動配置環境。

#### 方法二：從源代碼編譯

```bash
git clone https://github.com/aneterw/NoadYT-Desktop.git
cd NoadYT-Desktop
npm install
pip install yt-dlp youtube_transcript_api

# 開發模式
npm run dev

# 構建 MSI
npm run build
npx tauri build
```

構建產出：
```
src-tauri/target/release/bundle/msi/NoadYT-Desktop_0.8.0_x64.msi
```

### 專案結構

```
NoadYT-Desktop/
├── src/                    # 前端 React 源代碼
│   ├── pages/
│   │   ├── Home.tsx        # 主頁面（搜尋+影片/頻道標籤）
│   │   ├── ChannelVideos.tsx  # 頻道影片清單頁
│   │   └── VideoPlayer.tsx    # 內建播放器頁
│   ├── components/         # 共用組件
│   └── lib/                # 工具函式
├── src-tauri/              # 後端 Rust 源代碼
│   ├── src/main.rs         # Tauri 命令處理
│   ├── tauri.conf.json     # Tauri 配置
│   └── resources/python/
│       └── youtube_extractor.py  # Python 提取腳本
├── python/                 # Python 源碼（與 resources 同步）
└── package.json
```

### 技術棧

| 層 | 技術 |
|---|---|
| 前端 | React 18 + TypeScript + Tailwind CSS + Vite |
| 桌面框架 | Tauri 2 (Rust) |
| 播放器 | libmpv（GPU 硬體解碼） |
| 後端 | Python + yt-dlp + youtube_transcript_api |

### 授權

本項目採用 [MIT License](LICENSE)。

### 貢獻

歡迎提交 Issue 和 Pull Request。

[⬆ 回到頂端 / Back to top](#noadyt-desktop)

---

## 🇺🇸 English

NoadYT-Desktop is a desktop YouTube player built with Tauri 2 + React + Python (yt-dlp), featuring video search, channel search, built-in libmpv playback, and synchronized subtitle download.

### Features

- 🔍 **Video Search**: Search YouTube videos by keyword; returns a list of individual videos (title, thumbnail, duration, view count)
- 📺 **Channel Search**: Search YouTube channels by keyword; click a channel card to browse its latest videos
- 🎬 **Built-in Player**: Embedded libmpv (GPU hardware decode), or switch to external players (PotPlayer / VLC / MPV)
- 📝 **Subtitles**: Auto-download and display subtitles; supports TimedText and YouTube Transcript API (TimedText preferred)
- 🎨 **Subtitle Customization**: Adjustable size (12–64px), color (yellow), and background opacity (75%)
- 💾 **Cache Management**: Clear download and subtitle caches
- ⌨️ **Shortcuts**: Space play/pause, ←/→ seek 10s, ↑/↓ volume, F fullscreen

### Search: Video vs Channel

Two search modes with different purposes:

| | Video Search | Channel Search |
|---|---|---|
| **Target** | Individual video (Video) | YouTube channel / creator (Channel) |
| **Results** | Video list: title, thumbnail, duration, view count | Channel list: channel name, subscriber count, thumbnail |
| **Use Case** | You know "what to watch" → find that specific video | You know "who to follow" → find that channel, then browse its latest posts |
| **After Results** | Click video thumbnail → play immediately | Click channel card → enter channel page → browse latest N videos |

**Same operation**: Enter keyword → switch to "Video / Channel" tab → click "Search".

### Installation

#### Download from GitHub

Go to [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) and download the latest MSI installer:

```
NoadYT-Desktop_0.8.0_x64.msi
```

#### System Requirements

| Item | Requirement |
|---|---|
| OS | Windows 10/11 |
| Python | 3.12 (with `yt-dlp` and `youtube_transcript_api`) |
| WebView2 | Built into Windows or install manually |

#### Installation Steps

1. Download `NoadYT-Desktop_0.8.0_x64.msi`
2. Double-click to run the installer
3. Follow the wizard to complete installation
4. Launch the app to start using it

### Usage

#### Search Videos

1. Switch to the "Video" tab
2. Enter a keyword (e.g., `24h live news`, `日語教學`)
3. Click "Search" or press Enter
4. Click any video thumbnail to play

#### Search Channels

1. Switch to the "Channel" tab
2. Enter a keyword (e.g., `BBC News`, `跳脫舒適圈`)
3. Click "Search" or press Enter
4. Results show channel cards (name, subscriber count)
5. Click a channel card → browse its latest videos
6. Click a video to play

#### Play Video & Subtitles

1. Click a video thumbnail to enter the player
2. Video streams automatically
3. Subtitles appear at the bottom if available
4. Use the size slider to adjust (12–64px)

#### Player Shortcuts

| Key | Function |
|---|---|
| Space | Play / Pause |
| ← → | Seek 10s |
| ↑ ↓ | Volume |
| F | Fullscreen toggle |

#### Settings

Adjustable options:
- Search result count
- Default resolution (Auto / 1080P / 720P / 480P)
- Player selection (built-in / external)
- Subtitle language priority
- Clear cache

### Quick Start

#### Method 1: Install MSI (Recommended)

1. Download `NoadYT-Desktop_0.8.0_x64.msi`
2. Double-click to install
3. Launch the app
4. Search → click a video to play

Completes in 2–3 minutes, no manual setup needed.

#### Method 2: Build from Source

```bash
git clone https://github.com/aneterw/NoadYT-Desktop.git
cd NoadYT-Desktop
npm install
pip install yt-dlp youtube_transcript_api

# Dev mode
npm run dev

# Build MSI
npm run build
npx tauri build
```

Build output:
```
src-tauri/target/release/bundle/msi/NoadYT-Desktop_0.8.0_x64.msi
```

### Project Structure

```
NoadYT-Desktop/
├── src/                    # Frontend React source
│   ├── pages/
│   │   ├── Home.tsx        # Main page (search + video/channel tabs)
│   │   ├── ChannelVideos.tsx  # Channel video list page
│   │   └── VideoPlayer.tsx    # Built-in player page
│   ├── components/         # Shared components
│   └── lib/                # Utility functions
├── src-tauri/              # Backend Rust source
│   ├── src/main.rs         # Tauri command handlers
│   ├── tauri.conf.json     # Tauri config
│   └── resources/python/
│       └── youtube_extractor.py  # Python extractor script
├── python/                 # Python source (synced with resources)
└── package.json
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| Desktop | Tauri 2 (Rust) |
| Player | libmpv (GPU hardware decode) |
| Backend | Python + yt-dlp + youtube_transcript_api |

### License

This project is licensed under the [MIT License](LICENSE).

### Contributing

Issues and PRs are welcome.

[⬆ 回到頂端 / Back to top](#noadyt-desktop)

---

Made with ❤️ by NoadYT-Desktop
