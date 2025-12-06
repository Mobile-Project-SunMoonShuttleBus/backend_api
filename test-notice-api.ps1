# 셔틀 공지 API 테스트 스크립트
# 사용법: .\test-notice-api.ps1

Write-Host "`n=== 셔틀 공지 API 테스트 ===" -ForegroundColor Cyan

# 1. 서버 준비 상태 확인
Write-Host "`n[1단계] 서버 준비 상태 확인..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-WebRequest -Uri "http://124.61.202.9:8080/api/notices/shuttle" -Method Get -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ 서버 응답: $($healthCheck.StatusCode)" -ForegroundColor Green
    
    $content = $healthCheck.Content | ConvertFrom-Json
    if ($content.success -eq $false) {
        Write-Host "⚠️ 서버가 아직 준비되지 않았습니다." -ForegroundColor Yellow
        Write-Host "   메시지: $($content.message)" -ForegroundColor Gray
        Write-Host "   DB 상태: $($content.dbStatus)" -ForegroundColor Gray
        Write-Host "`n서버 로그 확인: docker logs -f backend_api-main_server-1" -ForegroundColor Cyan
        exit 1
    } else {
        Write-Host "✅ 서버 준비 완료!" -ForegroundColor Green
        Write-Host "   현재 DB에 저장된 공지 개수: $($content.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ 서버 연결 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. 동기화 요청
Write-Host "`n[2단계] 셔틀 공지 동기화 요청 (최대 10분 소요 가능)..." -ForegroundColor Yellow
Write-Host "   진행 중..." -ForegroundColor Gray

try {
    $body = @{} | ConvertTo-Json -Compress
    $utf8Body = [System.Text.Encoding]::UTF8.GetBytes($body)
    
    $syncResponse = Invoke-WebRequest `
        -Uri "http://124.61.202.9:8080/api/notices/shuttle/sync" `
        -Method Post `
        -Headers @{"Content-Type"="application/json; charset=utf-8"; "Accept"="application/json"} `
        -Body $utf8Body `
        -UseBasicParsing `
        -TimeoutSec 600 `
        -ErrorAction Stop
    
    Write-Host "✅ 동기화 완료! 응답 상태: $($syncResponse.StatusCode)" -ForegroundColor Green
    $syncResult = $syncResponse.Content | ConvertFrom-Json
    Write-Host "`n동기화 결과:" -ForegroundColor Cyan
    Write-Host "   메시지: $($syncResult.message)" -ForegroundColor White
    Write-Host "   처리된 공지: $($syncResult.processed)개" -ForegroundColor White
    Write-Host "   셔틀 관련 공지: $($syncResult.shuttleRelated)개" -ForegroundColor White
    Write-Host "   오류: $($syncResult.errors)개" -ForegroundColor $(if ($syncResult.errors -gt 0) { "Yellow" } else { "White" })
    Write-Host "   LLM 실패: $($syncResult.llmFailures)개" -ForegroundColor $(if ($syncResult.llmFailures -gt 0) { "Yellow" } else { "White" })
    
    if ($syncResult.llmFailures -gt 0) {
        Write-Host "`n⚠️ LLM 연결 실패가 발생했습니다. Ollama 서버 상태를 확인하세요." -ForegroundColor Yellow
    }
} catch {
    Write-Host "`n❌ 동기화 실패" -ForegroundColor Red
    Write-Host "   오류: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "   상세: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
    Write-Host "`n서버 로그 확인: docker logs -f backend_api-main_server-1" -ForegroundColor Cyan
    exit 1
}

# 3. 리스트 조회
Write-Host "`n[3단계] 셔틀 공지 리스트 조회..." -ForegroundColor Yellow

try {
    $listResponse = Invoke-WebRequest `
        -Uri "http://124.61.202.9:8080/api/notices/shuttle" `
        -Method Get `
        -UseBasicParsing `
        -ErrorAction Stop
    
    Write-Host "✅ 리스트 조회 완료! 응답 상태: $($listResponse.StatusCode)" -ForegroundColor Green
    $notices = $listResponse.Content | ConvertFrom-Json
    
    if ($notices.Count -eq 0) {
        Write-Host "⚠️ DB에 셔틀 공지가 없습니다." -ForegroundColor Yellow
    } else {
        Write-Host "`n저장된 셔틀 공지 ($($notices.Count)개):" -ForegroundColor Cyan
        $notices | Select-Object -First 5 | ForEach-Object {
            Write-Host "   - $($_.title) ($($_.postedAt))" -ForegroundColor White
        }
        if ($notices.Count -gt 5) {
            Write-Host "   ... 외 $($notices.Count - 5)개" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "❌ 리스트 조회 실패: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== 테스트 완료 ===" -ForegroundColor Green
