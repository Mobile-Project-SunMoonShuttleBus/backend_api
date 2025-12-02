# 로컬 Ollama + Node.js + MongoDB 테스트 스크립트
# 사용자 제공 테스트 절차를 자동화

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "로컬 Ollama + Node.js + MongoDB 테스트" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 프로젝트 폴더 확인
Write-Host "[1단계] 프로젝트 폴더 확인" -ForegroundColor Yellow
$projectPath = "C:\Users\user\backend_api"
if (Test-Path $projectPath) {
    Set-Location $projectPath
    Write-Host "✓ 프로젝트 폴더로 이동 완료" -ForegroundColor Green
} else {
    Write-Host "✗ 프로젝트 폴더를 찾을 수 없습니다: $projectPath" -ForegroundColor Red
    exit 1
}

# 필수 파일 확인
Write-Host "`n필수 파일 확인 중..." -ForegroundColor Yellow
$requiredFiles = @("docker-compose.yml", ".env", "node_js")
$allExists = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file (없음)" -ForegroundColor Red
        $allExists = $false
    }
}

if (-not $allExists) {
    Write-Host "`n필수 파일이 누락되었습니다!" -ForegroundColor Red
    exit 1
}

# 2. .env 파일 확인 및 설정
Write-Host "`n[2단계] .env 파일 확인" -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host ".env 파일이 없습니다. example.env에서 복사합니다..." -ForegroundColor Yellow
    if (Test-Path "example.env") {
        Copy-Item example.env .env
        Write-Host "✓ .env 파일 생성 완료" -ForegroundColor Green
    } else {
        Write-Host "✗ example.env 파일이 없습니다!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "✓ .env 파일이 존재합니다" -ForegroundColor Green
}

# OLLAMA 설정 확인
Write-Host "`nOLLAMA 설정 확인:" -ForegroundColor Yellow
$ollamaUrl = Select-String -Path .env -Pattern "^OLLAMA_BASE_URL=" | ForEach-Object { $_.Line }
$ollamaModel = Select-String -Path .env -Pattern "^OLLAMA_MODEL=" | ForEach-Object { $_.Line }

if ($ollamaUrl -match "http://ollama:11434") {
    Write-Host "  ✓ $ollamaUrl" -ForegroundColor Green
} else {
    Write-Host "  ✗ OLLAMA_BASE_URL이 올바르지 않습니다" -ForegroundColor Red
    Write-Host "  현재: $ollamaUrl" -ForegroundColor Red
    Write-Host "  필요: OLLAMA_BASE_URL=http://ollama:11434" -ForegroundColor Yellow
    # 자동 수정
    (Get-Content .env) -replace "^OLLAMA_BASE_URL=.*", "OLLAMA_BASE_URL=http://ollama:11434" | Set-Content .env
    Write-Host "  → 자동으로 수정했습니다" -ForegroundColor Green
}

if ($ollamaModel -match "orca-mini:3b") {
    Write-Host "  ✓ $ollamaModel" -ForegroundColor Green
} else {
    Write-Host "  ✗ OLLAMA_MODEL이 올바르지 않습니다" -ForegroundColor Red
    Write-Host "  현재: $ollamaModel" -ForegroundColor Red
    Write-Host "  필요: OLLAMA_MODEL=orca-mini:3b" -ForegroundColor Yellow
    # 자동 수정
    (Get-Content .env) -replace "^OLLAMA_MODEL=.*", "OLLAMA_MODEL=orca-mini:3b" | Set-Content .env
    Write-Host "  → 자동으로 수정했습니다" -ForegroundColor Green
}

# 3. Docker Compose 실행
Write-Host "`n[3단계] Docker Compose 실행" -ForegroundColor Yellow
Write-Host "docker-compose up -d 실행 중..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Docker Compose 실행 완료" -ForegroundColor Green
} else {
    Write-Host "✗ Docker Compose 실행 실패" -ForegroundColor Red
    exit 1
}

# 컨테이너가 시작될 때까지 대기
Write-Host "`n컨테이너 시작 대기 중 (30초)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 컨테이너 확인
Write-Host "`n실행 중인 컨테이너 확인:" -ForegroundColor Yellow
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

$expectedContainers = @("main_server", "database", "ollama", "ollama-init")
$runningContainers = docker ps --format "{{.Names}}"

$allRunning = $true
foreach ($container in $expectedContainers) {
    if ($runningContainers -match $container) {
        Write-Host "  ✓ $container" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $container (실행 중이 아님)" -ForegroundColor Red
        $allRunning = $false
    }
}

if (-not $allRunning) {
    Write-Host "`n일부 컨테이너가 실행되지 않았습니다. 로그를 확인하세요:" -ForegroundColor Yellow
    Write-Host "  docker-compose logs" -ForegroundColor Cyan
}

# 4. Ollama 서비스 확인
Write-Host "`n[4단계] Ollama 서비스 확인" -ForegroundColor Yellow
Write-Host "Ollama API 테스트 중..." -ForegroundColor Yellow
$ollamaResponse = curl.exe -s http://localhost:11434/api/tags

if ($ollamaResponse) {
    Write-Host "✓ Ollama 서비스 정상 동작" -ForegroundColor Green
    Write-Host "응답: $ollamaResponse" -ForegroundColor Gray
} else {
    Write-Host "✗ Ollama 서비스에 연결할 수 없습니다" -ForegroundColor Red
    Write-Host "  docker logs ollama 확인 필요" -ForegroundColor Yellow
}

# 5. Node.js 컨테이너 환경 변수 확인
Write-Host "`n[5단계] Node.js 컨테이너 환경 변수 확인" -ForegroundColor Yellow
$containerName = docker ps --filter "name=main_server" --format "{{.Names}}" | Select-Object -First 1

if ($containerName) {
    Write-Host "컨테이너 이름: $containerName" -ForegroundColor Gray
    $envVars = docker exec $containerName env | Select-String -Pattern "OLLAMA"
    
    if ($envVars) {
        Write-Host "✓ OLLAMA 환경 변수 확인:" -ForegroundColor Green
        $envVars | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } else {
        Write-Host "✗ OLLAMA 환경 변수를 찾을 수 없습니다" -ForegroundColor Red
    }
} else {
    Write-Host "✗ main_server 컨테이너를 찾을 수 없습니다" -ForegroundColor Red
}

# 6. LLM 공지 분류 테스트
Write-Host "`n[6단계] LLM 공지 분류 테스트" -ForegroundColor Yellow
Write-Host "이 단계는 수동으로 실행해야 합니다:" -ForegroundColor Yellow
Write-Host ""
Write-Host "PowerShell에서 다음 명령어를 실행하세요:" -ForegroundColor Cyan
Write-Host '  curl.exe -X POST "http://localhost:8080/api/notices/shuttle/sync" \' -ForegroundColor White
Write-Host '    -H "Authorization: Bearer <토큰>" \' -ForegroundColor White
Write-Host '    -H "Content-Type: application/json"' -ForegroundColor White
Write-Host ""
Write-Host "정상 결과 예시:" -ForegroundColor Yellow
Write-Host '  { "processed": 10, "shuttleRelated": 3, "errors": 0, "llmFailures": 0 }' -ForegroundColor Gray

# 7. DB 확인
Write-Host "`n[7단계] DB 확인" -ForegroundColor Yellow
Write-Host "이 단계는 수동으로 실행해야 합니다:" -ForegroundColor Yellow
Write-Host ""
Write-Host "PowerShell에서 다음 명령어를 실행하세요:" -ForegroundColor Cyan
Write-Host '  curl.exe http://localhost:8080/api/notices/shuttle' -ForegroundColor White
Write-Host ""
Write-Host "0개 → LLM이 아직도 연결 실패" -ForegroundColor Yellow
Write-Host "1개 이상 → 정상" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "테스트 절차 완료!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "  1. 6단계와 7단계를 수동으로 실행하세요" -ForegroundColor White
Write-Host "  2. 모든 단계가 성공하면 서버에서도 동일하게 동작합니다" -ForegroundColor White
Write-Host ""





