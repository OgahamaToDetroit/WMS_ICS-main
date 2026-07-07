# ซ้อมพิธีวันขึ้นระบบจริงกับไฟล์ชั่วคราว: ต้นฉบับ + migrate deploy + ตรวจรับ (DATABASE.md ข้อ 2, 4)
# รันทุกครั้งที่มี migration ใหม่ — ผ่านที่นี่ = วันขึ้นจริงจะผ่าน
$root = Resolve-Path "$PSScriptRoot\.."
$master = Join-Path $root "Newdatabase\warehouse.db"
$tmp = Join-Path $env:TEMP "warehouse-rehearse.db"

Copy-Item $master $tmp -Force
Set-ItemProperty -Path $tmp -Name IsReadOnly -Value $false

Push-Location (Join-Path $root "server")
$env:DATABASE_URL = "file:$tmp"
npx prisma migrate deploy
$deployOk = $?
if ($deployOk) { node accept.js $tmp; $acceptOk = $? } else { $acceptOk = $false }
Remove-Item Env:DATABASE_URL
Pop-Location

Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Remove-Item "$tmp-wal", "$tmp-shm" -Force -ErrorAction SilentlyContinue

if ($deployOk -and $acceptOk) {
    Write-Host "`nซ้อมผ่าน — ขั้นตอนขึ้นระบบจริงใช้ได้กับข้อมูลต้นฉบับ"
} else {
    Write-Error "ซ้อมไม่ผ่าน — migration ล่าสุดมีปัญหากับข้อมูลจริง ต้องแก้ก่อนถึงวันขึ้นระบบ"
    exit 1
}
