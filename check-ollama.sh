#!/bin/bash
# Ollama 서비스 상태 확인 스크립트

# Ollama 컨테이너 로그 확인 (최근 20줄)
echo "2. Ollama 컨테이너 로그 (최근 20줄):"
docker logs ollama --tail 20
echo ""

# Ollama API 연결 테스트
echo "3. Ollama API 연결 테스트:"
if curl -f -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama API 연결 성공 (http://localhost:11434)"
    echo ""
    echo "다운로드된 모델 목록:"
    curl -s http://localhost:11434/api/tags | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g' || echo "모델 없음"
else
    echo "❌ Ollama API 연결 실패 (http://localhost:11434)"
    echo "   서버가 실행 중인지 확인하세요."
fi
echo ""

# 환경 변수 확인
echo "5. 환경 변수 확인 (.env 파일):"
if [ -f .env ]; then
    echo "OLLAMA_BASE_URL: $(grep OLLAMA_BASE_URL .env || echo '설정되지 않음')"
    echo "OLLAMA_MODEL: $(grep OLLAMA_MODEL .env || echo '설정되지 않음')"
else
    echo "❌ .env 파일을 찾을 수 없습니다."
fi
echo ""

echo "=== 진단 완료 ==="
echo ""
echo "Ollama를 시작하려면: docker-compose up -d ollama"
echo "Ollama 로그를 보려면: docker logs -f ollama"
