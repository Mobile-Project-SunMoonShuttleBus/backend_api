# 로컬 Ollama + Node.js + MongoDB 테스트 가이드

이 가이드는 로컬 환경에서 Ollama + Node.js + MongoDB 전체 시스템이 제대로 동작하는지 테스트하는 방법입니다.
이 과정을 통과하면 → 서버에서도 100% 성공합니다.

## ✅ 1단계: 프로젝트 폴더 확인

```powershell
cd C:\Users\user\backend_api
dir
```

**확인해야 할 파일들:**
- `docker-compose.yml` ✓
- `.env` ✓
- `node_js/` 폴더 ✓
- `database/` 또는 MongoDB 관련 설정 ✓

---

## 🟩 2단계: .env 파일 준비 (가장 중요)

로컬에서도 `.env` 안에 이 두 줄이 있어야 합니다:

```
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=orca-mini:3b
```

### 확인:
```powershell
type .env
```

### 없으면 추가:
```powershell
# .env 파일이 없으면 example.env에서 복사
if (!(Test-Path .env)) {
    Copy-Item example.env .env
}

# OLLAMA 설정 확인 및 추가
$content = Get-Content .env -Raw
if ($content -notmatch "OLLAMA_BASE_URL=http://ollama:11434") {
    Add-Content .env "`nOLLAMA_BASE_URL=http://ollama:11434"
}
if ($content -notmatch "OLLAMA_MODEL=orca-mini:3b") {
    Add-Content .env "`nOLLAMA_MODEL=orca-mini:3b"
}
```

---

## 🟩 3단계: 로컬에서 docker-compose 실행하기

```powershell
docker-compose up -d
```

정상적으로 올라가면 다음 4개 컨테이너가 생깁니다:
- `main_server`
- `database`
- `ollama`
- `ollama-init`

### 확인:
```powershell
docker ps
```

예상 출력:
```
CONTAINER ID   IMAGE                    STATUS         PORTS
xxx            backend_api-main_server   Up X minutes   0.0.0.0:8080->8080/tcp
xxx            mongo:latest             Up X minutes   0.0.0.0:27017->27017/tcp
xxx            ollama/ollama:latest     Up X minutes   0.0.0.0:11434->11434/tcp
xxx            curlimages/curl:latest   Exited (0)      ...
```

---

## 🟩 4단계: 로컬 Ollama가 살아 있는지 확인

```powershell
curl.exe http://localhost:11434/api/tags
```

**정상 출력 예시:**
```json
{"models":[{"name":"orca-mini:3b"}]}
```

이제 LLM 서버 정상입니다.

**문제가 있으면:**
```powershell
docker logs ollama
```

---

## 🟩 5단계: Node.js 컨테이너가 Ollama에 붙어 있는지 확인

```powershell
docker exec backend_api-main_server-1 env | findstr OLLAMA
```

**결과:**
```
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=orca-mini:3b
```

이게 나오면 성공입니다.

**컨테이너 이름이 다를 수 있으니 확인:**
```powershell
docker ps --filter "name=main_server" --format "{{.Names}}"
```

---

## 🟩 6단계: 로컬에서 LLM 공지 분류 테스트

토큰은 로컬에서 새로 발급하거나 서버 토큰 사용해도 됩니다.

**PowerShell에서:**
```powershell
curl.exe -X POST "http://localhost:8080/api/notices/shuttle/sync" `
  -H "Authorization: Bearer <토큰>" `
  -H "Content-Type: application/json"
```

**정상 결과:**
```json
{
  "processed": 10,
  "shuttleRelated": 3,
  "errors": 0,
  "llmFailures": 0
}
```

여기까지 되면, 로컬 환경은 서버랑 100% 동일하게 잘 동작하는 상태입니다.

**토큰 발급 방법:**
```powershell
# 로그인 API 호출하여 토큰 받기
curl.exe -X POST "http://localhost:8080/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"username":"your_username","password":"your_password"}'
```

---

## 🟩 7단계: 로컬 DB에 셔틀 공지 들어갔는지 확인

```powershell
curl.exe http://localhost:8080/api/notices/shuttle
```

**결과 해석:**
- **0개** → LLM이 아직도 연결 실패
- **1개 이상** → 정상 ✅

---

## 🔧 문제 해결

### 컨테이너가 시작되지 않을 때:
```powershell
# 로그 확인
docker-compose logs

# 특정 컨테이너 로그 확인
docker logs ollama
docker logs backend_api-main_server-1
docker logs backend_api-database-1
```

### Ollama 모델이 다운로드되지 않았을 때:
```powershell
# ollama-init 컨테이너 로그 확인
docker logs ollama-init

# 수동으로 모델 다운로드
curl.exe -X POST http://localhost:11434/api/pull -d '{"name":"orca-mini:3b"}'
```

### 환경 변수가 제대로 전달되지 않을 때:
```powershell
# .env 파일 확인
type .env

# 컨테이너 내부 환경 변수 확인
docker exec backend_api-main_server-1 env | findstr OLLAMA

# docker-compose 재시작
docker-compose down
docker-compose up -d
```

---

## ✅ 최종 확인 체크리스트

- [ ] 1단계: 필수 파일 확인 완료
- [ ] 2단계: .env 파일에 OLLAMA 설정 확인
- [ ] 3단계: 4개 컨테이너 모두 실행 중
- [ ] 4단계: Ollama API 응답 정상
- [ ] 5단계: Node.js 컨테이너에 OLLAMA 환경 변수 확인
- [ ] 6단계: LLM 공지 분류 테스트 성공 (llmFailures: 0)
- [ ] 7단계: DB에 셔틀 공지 데이터 확인

**모든 체크리스트를 통과하면 → 서버 배포 준비 완료! 🎉**





