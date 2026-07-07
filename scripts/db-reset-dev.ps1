# รีเซ็ตฐานพัฒนากลับเป็น "ข้อมูลส่งมอบสะอาด + schema ล่าสุด" (DATABASE.md ข้อ 2)
$root = Resolve-Path "$PSScriptRoot\.."
$master = Join-Path $root "Newdatabase\warehouse.db"
$dev = Join-Path $root "server\warehouse.dev.db"

if (Test-Path "$dev-wal") {
    Write-Error "พบไฟล์ -wal ข้างฐานข้อมูล: ปิดเซิร์ฟเวอร์/Prisma Studio ก่อนแล้วค่อยรีเซ็ต"
    exit 1
}

Copy-Item $master $dev -Force
# ต้นฉบับตั้ง read-only ไว้ — สำเนาที่ copy มาจะติดมาด้วย ต้องปลดให้เขียนได้
Set-ItemProperty -Path $dev -Name IsReadOnly -Value $false

Push-Location (Join-Path $root "server")
npx prisma migrate deploy
$deployOk = $?
Pop-Location

if ($deployOk) {
    Write-Host "รีเซ็ตเสร็จ: ข้อมูลกลับเป็นวันส่งมอบ + โครงสร้างตาม migration ล่าสุด"
} else {
    Write-Error "copy สำเร็จ แต่ migrate deploy ล้มเหลว — ตรวจ error ด้านบน"
    exit 1
}
