#!/bin/sh
# Ollama 모델 자동 다운로드 스크립트

set -e

OLLAMA_URL="${OLLAMA_BASE_URL:-http://ollama:11434}"
MODEL="${OLLAMA_MODEL:-orca-mini:3b}"

echo "Ollama 모델 다운로드 시작..."
echo "모델: $MODEL"
echo "Ollama URL: $OLLAMA_URL"

# Ollama가 준비될 때까지 대기
echo "Ollama 서비스 대기 중..."
until curl -f "$OLLAMA_URL/api/tags" > /dev/null 2>&1; do
  echo "Ollama가 아직 준비되지 않았습니다. 5초 후 재시도..."
  sleep 5
done

echo "Ollama 서비스 준비 완료!"

# 모델이 이미 다운로드되어 있는지 확인
echo "모델 확인 중..."
if curl -s "$OLLAMA_URL/api/tags" | grep -q "$MODEL"; then
  echo "모델 $MODEL이 이미 다운로드되어 있습니다."
else
  echo "모델 $MODEL 다운로드 중..."
  curl -X POST "$OLLAMA_URL/api/pull" -d "{\"name\": \"$MODEL\"}"
  echo ""
  echo "모델 $MODEL 다운로드 완료!"
fi

echo "설정 완료!"

