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
  try {
    const result = await syncShuttleNotices();
    res.json(result);
  } catch (e) {
    console.error(e);
    // 에러 메시지 노출 최소화 (보안)
    res
      .status(500)
      .json({ message: '셔틀 공지 동기화 실패' });
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

