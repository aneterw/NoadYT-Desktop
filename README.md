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

## 快速開始（最快運行方法）

如果你只想快速試用，請按照以下步驟：

### 方法一：直接安裝 MSI（推薦）

1. 從 [Releases](https://github.com/aneterw/NoadYT-Desktop/releases) 下載 `NoadYT-Desktop_0.1.0_x64.msi`
2. 雙擊運行安裝程序，按照嚮導完成安裝
3. 啟動 NoadYT-Desktop 應用程式
4. 在搜尋框輸入關鍵字，點擊「搜尋」
5. 點擊任一影片縮圖開始播放

整個過程約需 2-3 分鐘，無需手動配置環境。

### 方法二：從源代碼編譯運行（開發者）

如果你需要修改源代碼或參與開發：

#### 第一步：安裝依賴

```bash
# 克隆倉庫
git clone https://github.com/aneterw/NoadYT-Desktop.git
cd NoadYT-Desktop

# 安裝 Node.js 依賴
npm install

# 安裝 Python 依賴
pip install yt-dlp youtube_transcript_api
```

#### 第二步：啟動開發模式

```bash
# 啟動開發服務器
npm run dev
```

這會同時啟動 Vite 開發服務器和 Tauri 應用程式，適用於開發和測試。

#### 第三步：構建生產版本

```bash
# 構建前端
npm run build

# 構建 Tauri MSI 安裝程序
npx tauri build
```

構建完成後，MSI 安裝程序位於：
```
src-tauri/target/release/bundle/msi/NoadYT-Desktop_0.1.0_x64.msi
```

## 部署說明

### 生產環境部署

NoadYT-Desktop 是一個桌面應用程式，不需要伺服器部署。用戶只需在本地 Windows 電腦上安裝 MSI 即可使用。

### MSI 安裝程序構建（開發者）

如果你需要構建自己的 MSI 安裝程序：

```bash
# 1. 安裝 Rust 編譯環境（如果尚未安裝）
# 下載並安裝：https://rustup.rs/

# 2. 安裝 Tauri CLI
npm install -g @tauri-apps/cli

# 3. 安裝 WebView2 Runtime（Windows 系統級依賴）
# 下載：https://developer.microsoft.com/microsoft-edge/webview2/

# 4. 安裝 Python 3.12 並配置 PATH
pip install yt-dlp youtube_transcript_api

# 5. 構建 MSI
npm run build
npx tauri build
```

構建完成後的 MSI 檔案位於：
```
src-tauri/target/release/bundle/msi/NoadYT-Desktop_0.1.0_x64.msi
```

### 部署檢查清單

- [ ] Windows 10/11 系統
- [ ] Python 3.12 已安裝並加入 PATH
- [ ] `yt-dlp` 和 `youtube_transcript_api` 已安裝
- [ ] WebView2 Runtime 已安裝
- [ ] MSI 安裝程序已測試可正常安裝和運行

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