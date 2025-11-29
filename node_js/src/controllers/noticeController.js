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
  // 전체 작업 타임아웃 설정 (5분 = 300초)
  // 크롤링(20개 × 약 1초) + LLM 처리(20개 × 최대 15초) = 최대 약 5분
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error('동기화 작업이 5분을 초과했습니다.'));
    }, 300000);
  });

  try {
    const result = await Promise.race([
      syncShuttleNotices(),
      timeoutPromise
    ]);
    res.json(result);
  } catch (e) {
    console.error('셔틀 공지 동기화 실패:', e);
    // 에러 메시지 노출 최소화 (보안)
    const errorMessage = e.message && e.message.includes('5분') 
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
    const notice = await getShuttleNoticeDetail(id);
    res.json(notice);
  } catch (e) {
    if (e.code === 'NOT_FOUND') {
      return res.status(404).json({ message: '공지 없음' });
    }
    if (e.code === 'INVALID_ID') {
      return res.status(400).json({ message: '잘못된 공지 ID 형식입니다.' });
    }
    console.error(e);
    // 에러 메시지 노출 최소화 (보안)
    res.status(500).json({ message: '상세 조회 오류' });
  }
};

