/**
 * 셔틀 공지 컨트롤러
 * 공지 동기화, 리스트 조회, 상세 조회 API 핸들러
 */
const {
  syncShuttleNotices,
  getShuttleNoticeList,
  getShuttleNoticeDetail,
} = require('../services/shuttleNoticeService');
const { checkOllamaHealth } = require('../services/ollamaService');

/**
 * 셔틀 공지 동기화
 * POST /api/notices/shuttle/sync
 */
exports.syncNotices = async (req, res) => {
  // 전체 작업 타임아웃 설정 (15분 = 900초)
  // 크롤링(10개 × 약 2-3초) + LLM 처리(10개 × 최대 15초) = 최대 약 3-4분
  // 여유를 두고 15분으로 설정 (네트워크 지연, 서버 부하 고려)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('동기화 작업이 15분을 초과했습니다.'));
    }, 900000); // 15분 = 900초
  });

  try {
    console.log('==== [Start] 셔틀 공지사항 동기화 요청 (Notices) ====');
    // 여기서 실행되는 함수가 'syncShuttleNotices'인지 확인 (시간표 크롤링 아님)
    const result = await Promise.race([
      syncShuttleNotices(),
      timeoutPromise
    ]);
    
    console.log('==== [Success] 셔틀 공지 동기화 완료:', result);
    
    // UTF-8 인코딩 명시
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(result);

  } catch (e) {
    console.error('==== [Error] 셔틀 공지 동기화 실패:', e);
    
    // 에러 메시지 노출 최소화 (보안)
    const errorMessage = e.message && e.message.includes('15분') 
      ? '동기화 작업 시간 초과'
      : '셔틀 공지 동기화 실패';
      
    res.status(500).json({ 
      message: errorMessage, 
      error: process.env.NODE_ENV === 'development' ? e.message : undefined 
    });
  }
};

/**
 * 셔틀 공지 리스트 조회
 * GET /api/notices/shuttle
 */
exports.getShuttleNotices = async (req, res) => {
  try {
    const list = await getShuttleNoticeList();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(list);
  } catch (e) {
    console.error('공지 리스트 조회 실패:', e);
    res.status(500).json({ message: '조회 오류' });
  }
};

/**
 * 셔틀 공지 상세 조회 + 요약
 * GET /api/notices/shuttle/:id
 */
exports.getShuttleNoticeDetail = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 방어 코드: 라우팅 순서가 잘못되어 특수 경로가 ID로 들어오는 경우 차단
    if (id === 'sync' || id === 'health') {
      return res.status(400).json({ 
        message: `잘못된 요청입니다. '${id}'는 공지 ID가 될 수 없습니다.` 
      });
    }
    
    const notice = await getShuttleNoticeDetail(id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(notice);

  } catch (e) {
    if (e.code === 'NOT_FOUND') {
      return res.status(404).json({ message: '해당 공지를 찾을 수 없습니다.' });
    }
    if (e.code === 'INVALID_ID') {
      return res.status(400).json({ message: '잘못된 공지 ID 형식입니다. MongoDB ObjectId 형식(24자리 16진수)이 필요합니다.' });
    }
    
    console.error('공지 상세 조회 실패:', e);
    res.status(500).json({ message: '상세 조회 오류' });
  }
};

/**
 * Ollama 서버 상태 확인 (진단용)
 * GET /api/notices/shuttle/health
 */
exports.checkOllamaHealth = async (req, res) => {
  try {
    const isHealthy = await checkOllamaHealth();
    const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'orca-mini:3b';
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (isHealthy) {
      res.json({
        status: 'healthy',
        message: 'Ollama 서버가 정상적으로 연결됩니다.',
        ollamaUrl,
        model,
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        message: 'Ollama 서버에 연결할 수 없습니다.',
        ollamaUrl,
        model,
        troubleshooting: [
          'docker ps | grep ollama - Ollama 컨테이너가 실행 중인지 확인',
          'docker logs ollama - Ollama 로그 확인',
          'docker-compose up -d ollama - Ollama 시작',
          `docker exec ollama ollama pull ${model} - 모델 다운로드`,
        ],
      });
    }
  } catch (e) {
    console.error('Ollama 상태 확인 실패:', e);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      status: 'error',
      message: 'Ollama 상태 확인 중 오류가 발생했습니다.',
      error: e.message,
    });
  }
};