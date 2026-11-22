# NoadYT-Desktop

NoadYT-Desktop 是一個基於 Tauri 2 + React + Python (yt-dlp) 的桌面影片播放器應用程式，支援從 YouTube 下載影片和字幕並本地播放。

## 功能特色

- 🔍 **影片搜尋**：支援關鍵字搜尋 YouTube 影片
- 📺 **頻道搜尋**：支援搜尋 YouTube 頻道並瀏覽頻道影片
- 🎬 **本地播放**：下載影片後本地播放，支援內建播放器（WebView2）或外部播放器（PotPlayer/VLC/MPV）
- 📝 **字幕支援**：自動下載並顯示字幕，支援 TimedText 和 YouTube Transcript API 兩種來源，TimedText 優先
- 🎨 **字幕自訂**：支援調整字幕大小（12px–64px）、字體顏色（黃色）、背景透明度（75%）
- 💾 **緩存管理**：支援清除下載與字幕緩存
- ⌨️ **快捷鍵**：空白鍵暫停/播放，左右鍵前後跳 10 秒，上下鍵調整音量，F 鍵全螢幕

## 安裝方法

### 從 GitHub 下載

前往 [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) 頁面下載最新的 MSI 安裝程序：

```
NoadYT-Desktop_0.1.0_x64.msi
```

### 系統需求

- Windows 10/11
- Python 3.12（需安裝 `yt-dlp` 和 `youtube_transcript_api`）
- WebView2 Runtime（Windows 內建或自行安裝）

### 安裝步驟

1. 下載 `NoadYT-Desktop_0.1.0_x64.msi`
2. 雙擊運行安裝程序
3. 按照嚮導完成安裝
4. 啟動應用程式即可使用

## 使用說明

### 搜尋影片

1. 在搜尋框輸入關鍵字
2. 點擊「搜尋」按鈕或按 Enter 鍵
3. 從搜尋結果中選擇想要播放的影片

### 播放影片與字幕

1. 點擊影片縮圖進入播放頁面
2. 影片會自動下載並播放
3. 如果有可用字幕，會自動顯示在畫面底部
4. 使用「字幕大小」滑塊調整字幕大小（12px–64px）

### 播放器快捷鍵

| 按鍵 | 功能 |
|------|------|
| 空白鍵 | 播放/暫停 |
| ← → | 前後跳 10 秒 |
| ↑ ↓ | 調整音量 |
| F | 全螢幕/退出全螢幕 |

### 設定

在設定頁面可以調整：
- 搜尋結果數量
- 預設解析度（自動/1080P/720P/480P）
- 播放器選擇（內建/外部）
- 字幕語言優先順序
- 清除緩存

## 專案結構

```
NoadYT-Desktop/
├── src/                    # 前端 React 源代碼
│   ├── App.tsx             # 主應用程式組件
│   ├── index.css           # 全局樣式
│   └── main.tsx            # 入口文件
├── src-tauri/              # 後端 Rust 源代碼
│   ├── src/main.rs         # Tauri 命令處理
│   ├── build.rs            # 構建腳本
│   ├── tauri.conf.json     # Tauri 配置
│   ├── resources/          # 資源文件（Python、FFmpeg）
│   └── python/
│       └── youtube_extractor.py  # Python 影片/字幕提取腳本
├── dist/                   # 前端構建輸出
├── node_modules/           # Node.js 依賴
├── package.json            # 項目配置
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind CSS 配置
├── tsconfig.json           # TypeScript 配置
└── .gitignore              # Git 忽略規則
```

## 技術棧

- **前端**：React 18 + TypeScript + Tailwind CSS + Vite
- **桌面框架**：Tauri 2 (Rust)
- **後端**：Python + yt-dlp + youtube_transcript_api
- **播放器**：WebView2（內建）或 外部播放器（PotPlayer/VLC/MPV）

## 授權

本項目採用 [MIT License](LICENSE)。

## 貢獻

歡迎提交 Issue 和 Pull Request。

## 聯繫

如有問題或建議，請在 GitHub 上開立 Issue。

---

Made with ❤️ by NoadYT-Desktop