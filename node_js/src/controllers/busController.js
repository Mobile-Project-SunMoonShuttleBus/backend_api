const ShuttleRoute = require('../models/ShuttleRoute');

// 버스정보 전체 조회
exports.getBusRoutes = async (req, res) => {
  try {
    const { busType, dayType } = req.query;
    const filter = {};
    if (busType) filter.busType = busType;
    if (dayType) filter.dayType = dayType;
    const list = await ShuttleRoute.find(filter);
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: '조회 오류', error: e.message });
  }
};

// 버스정보 상세 조회
exports.getBusRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const route = await ShuttleRoute.findOne({ routeId });
    if (!route) return res.status(404).json({ message: '버스정보 없음' });
    res.json(route);
  } catch (e) {
    res.status(500).json({ message: '상세 조회 오류', error: e.message });
  }
};
