$prod = Get-CimInstance Win32_Product | Where-Object { $_.Name -like '*NoadYT*' }
if ($prod) {
    Write-Host "Found old version: $($prod.Name)"
    $prod.Uninstall()
} else {
    Write-Host "No old version found, skipping uninstall"
}
Write-Host "Installing new version..."
Start-Process msiexec -ArgumentList "/i `"C:\Users\Aneter-MiniPC\NoadYT-Desktop\src-tauri\target\release\bundle\msi\NoadYT-Desktop_0.1.0_x64_en-US.msi`" /qn /norestart" -Wait
Write-Host "Installation complete!"
