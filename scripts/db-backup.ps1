# สำรองฐานพัฒนาแบบประทับวันที่ — รันก่อน prisma migrate dev ทุกครั้ง (DATABASE.md ข้อ 2)
$root = Resolve-Path "$PSScriptRoot\.."
$src = Join-Path $root "server\warehouse.dev.db"

if (Test-Path "$src-wal") {
    Write-Error "พบไฟล์ -wal ข้างฐานข้อมูล: ปิดเซิร์ฟเวอร์/Prisma Studio ก่อนแล้วค่อยสำรอง"
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$dest = Join-Path $root "backups\warehouse-dev-$stamp.db.bak"
Copy-Item $src $dest
Write-Host "สำรองแล้ว: backups\warehouse-dev-$stamp.db.bak"
