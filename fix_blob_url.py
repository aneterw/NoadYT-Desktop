path = r'C:\Users\Aneter-MiniPC\NoadYT-Desktop\src\App.tsx'
content = open(path, 'r', encoding='utf-8').read()

# 替換 tauri://local-files/ 方式為 Blob URL 方式
old_block = """        // 本地 MP4 檔案路徑（Windows：file:///C:\\...\\xxx.mp4），用 read_binary_file 創建 Blob URL 播放
        // 繞過 WebView2 對 file:// URI 的安全限制
        const isLocalFile = url.includes(':\\\\\\\\') || url.startsWith('file://')
        if (isLocalFile) {
          // 將 file:// URI 轉為 tauri://local-files/ URI，繞過 WebView2 安全限制
          let localPath = url.slice(8).replace(/\\\\/g, '/')
          let tauriUrl = 'tauri://local-files/' + localPath
          console.log('[DEBUG playVideo] local file path:', localPath)
          console.log('[DEBUG playVideo] tauri URL:', tauriUrl)
          try {
            videoEl.src = tauriUrl
            videoEl.onloadedmetadata = () => {
              console.log('[DEBUG playVideo] tauri URL metadata loaded, switching to player page')
              setPage('player')
            }
            videoEl.onerror = (_e: any) => {
              setLoading(false)
              setError('<video> 無法播放此檔案: ' + (videoEl.error?.message || '未知錯誤'))
            }
            videoEl.play().catch((e: any) => {
              console.error('[DEBUG playVideo] video play failed:', e)
              setError('影片播放失敗: ' + (e.message || String(e)))
            })
          } catch (err: any) {
            setLoading(false)
            setError('播放失敗: ' + (err.message || String(err)))
          }
        } else {"""

new_block = """        // 本地 MP4 檔案（Windows：file:///C:\\...\\xxx.mp4），用 Blob URL 播放
        // 繞過 WebView2 對 file:// URI 的安全限制
        const isLocalFile = url.includes(':\\\\\\\\') || url.startsWith('file://')
        if (isLocalFile) {
          // 將 file:/// URI 轉回 Windows 本地路徑
          let localPath = url.slice(8).replace(/\\\\/g, '/')
          console.log('[DEBUG playVideo] local file path:', localPath)
          try {
            // 讀取檔案並創建 Blob URL
            const bytes: Uint8Array = await invoke('read_binary_file', { path: localPath })
            const blob = new Blob([bytes], { type: 'video/mp4' })
            const blobUrl = URL.createObjectURL(blob)
            console.log('[DEBUG playVideo] blob URL created:', blobUrl)
            videoEl.src = blobUrl
            videoEl.onloadedmetadata = () => {
              console.log('[DEBUG playVideo] blob URL metadata loaded, switching to player page')
              URL.revokeObjectURL(blobUrl)
              setPage('player')
            }
            videoEl.onerror = (_e: any) => {
              setLoading(false)
              URL.revokeObjectURL(blobUrl)
              setError('<video> 無法播放此檔案: ' + (videoEl.error?.message || '未知錯誤'))
            }
            videoEl.play().catch((e: any) => {
              console.error('[DEBUG playVideo] video play failed:', e)
              setError('影片播放失敗: ' + (e.message || String(e)))
            })
          } catch (err: any) {
            setLoading(false)
            setError('播放失敗: ' + (err.message || String(err)))
          }
        } else {"""

content = content.replace(old_block, new_block)

# 同樣修復字幕 track src：改用 Blob URL
old_sub = """            // Windows 本地路徑轉 tauri://local-files/ URI，否則 <track src> 無法載入
            let trackSrc = sub.path
            if (trackSrc && trackSrc.includes(':\\\\')) {
              trackSrc = 'tauri://local-files/' + trackSrc.slice(8).replace(/\\\\/g, '/')
            }"""

new_sub = """            // Windows 本地路徑轉 Blob URL，否則 <track src> 無法載入
            let trackSrc = sub.path
            if (trackSrc && trackSrc.includes(':\\\\')) {
              let subLocalPath = trackSrc.slice(8).replace(/\\\\/g, '/')
              try {
                const subBytes: Uint8Array = await invoke('read_binary_file', { path: subLocalPath })
                const subBlob = new Blob([subBytes], { type: 'text/vtt' })
                trackSrc = URL.createObjectURL(subBlob)
              } catch (e) {
                trackSrc = ''
              }
            }"""

content = content.replace(old_sub, new_sub)

open(path, 'w', encoding='utf-8').write(content)
print('Done - switched to Blob URL approach')
