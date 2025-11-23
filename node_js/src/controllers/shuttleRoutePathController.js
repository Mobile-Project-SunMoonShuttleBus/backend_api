const { getRoutePath } = require('../services/shuttleRoutePathService');
const ShuttleBus = require('../models/ShuttleBus');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

exports.getRoutePath = async (req, res) => {
  try {
    const { departure, arrival, direction, dayType } = mergeRequestParams(req);

    if (!departure || !arrival || !direction || !dayType) {
      return res.status(400).json({
        message: '필수 파라미터가 누락되었습니다.',
        required: ['departure', 'arrival', 'direction', 'dayType']
      });
    }

    if (!['등교', '하교'].includes(direction)) {
      return res.status(400).json({
        message: 'direction은 "등교" 또는 "하교"여야 합니다.'
      });
    }

    const schedule = await ShuttleBus.findOne({
      departure,
      arrival,
      dayType
    }).select('viaStops').lean();

    if (!schedule) {
      return res.status(404).json({
        message: '해당 노선의 시간표를 찾을 수 없습니다.'
      });
    }

    const viaStops = schedule.viaStops || [];

    const result = await getRoutePath(departure, arrival, direction, dayType, viaStops);

    if (!result.success) {
      return res.status(404).json({
        message: result.error || '경로를 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      route: {
        departure: result.routePath.departure,
        arrival: result.routePath.arrival,
        direction: result.routePath.direction,
        dayType: result.routePath.dayType,
        viaStops: result.routePath.viaStops,
        path: result.routePath.path,
        distance: result.routePath.distance,
        duration: result.routePath.duration,
        stopCoordinates: result.routePath.stopCoordinates
      }
    });
  } catch (error) {
    console.error('경로 조회 오류:', error);
    res.status(500).json({
      message: '경로 조회 중 오류가 발생했습니다.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

