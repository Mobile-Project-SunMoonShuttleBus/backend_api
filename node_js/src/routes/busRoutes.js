const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');
const busScheduleService = require('../services/busScheduleService');

// 전체 목록 조회
router.get('/routes', busController.getBusRoutes);

// 상세값 조회
router.get('/route/:routeId', busController.getBusRoute);

// 시간표 수동 업데이트 (테스트/관리용)
router.post('/update-schedule', async (req, res) => {
  try {
    const result = await busScheduleService.updateAllSchedules();
    res.json({ message: '시간표 업데이트 완료', result });
  } catch (error) {
    res.status(500).json({ message: '시간표 업데이트 실패', error: error.message });
  }
});

module.exports = router;
