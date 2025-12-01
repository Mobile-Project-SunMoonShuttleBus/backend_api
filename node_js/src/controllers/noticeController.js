/**
 * 셔틀 공지 컨트롤러
 * 공지 동기화, 리스트 조회, 상세 조회 API 핸들러
 */
const {
  syncShuttleNotices,
  getShuttleNoticeList,
  getShuttleNoticeDetail,
} = require('../services/shuttleNoticeService');

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
    console.log('셔틀 공지 동기화 요청 시작 (타임아웃: 15분)');
    const result = await Promise.race([
      syncShuttleNotices(),
      timeoutPromise
    ]);
    console.log('셔틀 공지 동기화 성공:', result);
    res.json(result);
  } catch (e) {
    console.error('셔틀 공지 동기화 실패:', e);
    // 에러 메시지 노출 최소화 (보안)
    const errorMessage = e.message && e.message.includes('15분') 
      ? '동기화 작업 시간 초과'
      : '셔틀 공지 동기화 실패';
    res
      .status(500)
      .json({ message: errorMessage });
  }
};

/**
 * 셔틀 공지 리스트 조회
 * GET /api/notices/shuttle
 */
exports.getShuttleNotices = async (req, res) => {
  try {
    const list = await getShuttleNoticeList();
    res.json(list);
  } catch (e) {
    console.error(e);
    // 에러 메시지 노출 최소화 (보안)
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
    
    // "sync" 같은 특수 경로가 ID로 들어온 경우 명확한 에러 메시지 제공
    if (id === 'sync') {
      return res.status(400).json({ 
        message: '동기화 엔드포인트입니다. 공지 상세 조회는 GET /api/notices/shuttle/{공지ID} 형식으로 요청해주세요.' 
      });
    }
    
    const notice = await getShuttleNoticeDetail(id);
    res.json(notice);
  } catch (e) {
    if (e.code === 'NOT_FOUND') {
      return res.status(404).json({ message: '공지 없음' });
    }
    if (e.code === 'INVALID_ID') {
      return res.status(400).json({ message: '잘못된 공지 ID 형식입니다. MongoDB ObjectId 형식(24자리 16진수)이 필요합니다.' });
    }
    console.error(e);
    // 에러 메시지 노출 최소화 (보안)
    res.status(500).json({ message: '상세 조회 오류' });
  }
};

