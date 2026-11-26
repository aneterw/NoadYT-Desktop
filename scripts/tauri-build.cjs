/**
 * 包裝 tauri build，編譯完成後將 MSI 檔名中的 _en-US 字尾移除。
 *
 * 原因：Tauri CLI 在 x64 release 模式下會產生 NoadYT-Desktop_x64_en-US.msi，
 *       但本產品為繁體中文介面，不需要英文語系標籤。
 * 用法：node scripts/tauri-build.cjs [--release]
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isRelease = args.includes('--release') || !args.includes('--debug');

// 執行 npx tauri build（使用專案根目錄下的 .npmrc / node_modules）
const result = spawnSync('npx', ['tauri', 'build'].concat(args), {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  shell: true,
});

if (result.status !== 0 && result.status !== null) {
  process.exit(result.status ?? 1);
}

// 重新命名 MSI：移除 _en-US 字尾
const msiDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'msi');
if (!fs.existsSync(msiDir)) {
  console.log('[postbuild] No MSI bundle directory found.');
  process.exit(result.status ?? 0);
}

const files = fs.readdirSync(msiDir).filter(f => f.endsWith('.msi'));
for (const file of files) {
  if (file.includes('_en-US')) {
    const oldPath = path.join(msiDir, file);
    const newName = file.replace('_en-US', '');
    const newPath = path.join(msiDir, newName);
    if (fs.existsSync(newPath)) {
      try { fs.unlinkSync(newPath); } catch (_) {}
    }
    fs.renameSync(oldPath, newPath);
    console.log(`[postbuild] Renamed: ${file} -> ${newName}`);
  }
}

process.exit(result.status ?? 0);
