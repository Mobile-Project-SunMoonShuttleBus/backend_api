# 셔틀 공지 동기화 실시간 로그 확인 스크립트
# 사용법: .\watch-notice-sync.ps1

Write-Host "`n=== 셔틀 공지 동기화 실시간 로그 ===" -ForegroundColor Cyan
Write-Host "종료하려면 Ctrl+C를 누르세요`n" -ForegroundColor Yellow

# 동기화 관련 키워드로 필터링하여 실시간 로그 표시
docker logs -f backend_api-main_server-1 2>&1 | ForEach-Object {
    $line = $_
    # 동기화 관련 키워드가 포함된 줄만 표시
    if ($line -match '공지|동기화|sync|셔틀|notice|crawl|크롤링|수집|처리|완료|실패|오류|LLM|Ollama|후보|프리필터') {
        # 중요 로그는 색상으로 구분
        if ($line -match '동기화 완료|완료|성공') {
            Write-Host $line -ForegroundColor Green
        } elseif ($line -match '실패|오류|에러|timeout|타임아웃') {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match '시작|요청') {
            Write-Host $line -ForegroundColor Cyan
        } elseif ($line -match 'LLM|Ollama') {
            Write-Host $line -ForegroundColor Yellow
        } else {
            Write-Host $line
        }
    }
}
