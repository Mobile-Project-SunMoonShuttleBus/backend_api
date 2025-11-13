const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

// 통합 정류장 목록 조회
exports.getAllStops = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);

    const matchStage = {};
    if (dayType) matchStage.dayType = dayType;

    // 셔틀버스 정류장 수집
    const [shuttleAggregated] = await ShuttleBus.aggregate([
      { $match: matchStage },
      {
        $project: {
          dayType: 1,
          departure: 1,
          arrival: 1,
          viaStops: 1
        }
      },
      {
        $facet: {
          departures: [
            {
              $group: {
                _id: { stop: '$departure', dayType: '$dayType' }
              }
            }
          ],
          arrivals: [
            {
              $group: {
                _id: { stop: '$arrival', dayType: '$dayType' }
              }
            }
          ]
        }
      }
    ]);

    // 통학버스 정류장 수집
    const [campusAggregated] = await CampusBus.aggregate([
      { $match: matchStage },
      {
        $project: {
          dayType: 1,
          departure: 1,
          arrival: 1,
          direction: 1,
          viaStops: 1
        }
      },
      {
        $facet: {
          departures: [
            {
              $group: {
                _id: { stop: '$departure', dayType: '$dayType', direction: '$direction' }
              }
            }
          ],
          arrivals: [
            {
              $group: {
                _id: { stop: '$arrival', dayType: '$dayType', direction: '$direction' }
              }
            }
          ]
        }
      }
    ]);

    // 경유지 수집 (셔틀버스)
    const shuttleViaStops = await ShuttleBus.aggregate([
      { $match: matchStage },
      { $unwind: '$viaStops' },
      {
        $group: {
          _id: { stop: '$viaStops.name', dayType: '$dayType' }
        }
      }
    ]);

    // 경유지 수집 (통학버스)
    const campusViaStops = await CampusBus.aggregate([
      { $match: matchStage },
      { $unwind: '$viaStops' },
      {
        $group: {
          _id: { stop: '$viaStops.name', dayType: '$dayType', direction: '$direction' }
        }
      }
    ]);

    // 정류장 맵 생성
    const stopMap = new Map();

    const ensureStop = (name) => {
      if (!stopMap.has(name)) {
        stopMap.set(name, {
          name,
          availableIn: new Set(),
          dayTypes: new Set(),
          directions: new Set(),
          operatesAsDeparture: new Set(),
          operatesAsArrival: new Set(),
          shuttleDayTypes: new Set(),
          campusDayTypes: new Set(),
          campusDirections: new Set()
        });
      }
      return stopMap.get(name);
    };

    // 셔틀버스 출발지
    (shuttleAggregated.departures || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.availableIn.add('shuttle');
      stop.dayTypes.add(_id.dayType);
      stop.shuttleDayTypes.add(_id.dayType);
      stop.operatesAsDeparture.add(_id.dayType);
    });

    // 셔틀버스 도착지
    (shuttleAggregated.arrivals || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.availableIn.add('shuttle');
      stop.dayTypes.add(_id.dayType);
      stop.shuttleDayTypes.add(_id.dayType);
      stop.operatesAsArrival.add(_id.dayType);
    });

    // 셔틀버스 경유지
    shuttleViaStops.forEach(({ _id }) => {
      if (_id.stop) {
        const stop = ensureStop(_id.stop);
        stop.availableIn.add('shuttle');
        stop.dayTypes.add(_id.dayType);
        stop.shuttleDayTypes.add(_id.dayType);
        stop.operatesAsArrival.add(_id.dayType);
      }
    });

    // 통학버스 출발지
    (campusAggregated.departures || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.availableIn.add('campus');
      stop.dayTypes.add(_id.dayType);
      stop.campusDayTypes.add(_id.dayType);
      stop.directions.add(_id.direction);
      stop.campusDirections.add(_id.direction);
      stop.operatesAsDeparture.add(_id.dayType);
    });

    // 통학버스 도착지
    (campusAggregated.arrivals || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.availableIn.add('campus');
      stop.dayTypes.add(_id.dayType);
      stop.campusDayTypes.add(_id.dayType);
      stop.directions.add(_id.direction);
      stop.campusDirections.add(_id.direction);
      stop.operatesAsArrival.add(_id.dayType);
    });

    // 통학버스 경유지
    campusViaStops.forEach(({ _id }) => {
      if (_id.stop) {
        const stop = ensureStop(_id.stop);
        stop.availableIn.add('campus');
        stop.dayTypes.add(_id.dayType);
        stop.campusDayTypes.add(_id.dayType);
        stop.directions.add(_id.direction);
        stop.campusDirections.add(_id.direction);
        stop.operatesAsArrival.add(_id.dayType);
      }
    });

    // 배열로 변환 및 정렬
    const stops = Array.from(stopMap.values())
      .map((item) => ({
        name: item.name,
        availableIn: Array.from(item.availableIn).sort(),
        dayTypes: Array.from(item.dayTypes).sort(),
        directions: Array.from(item.directions).sort(),
        operatesAsDeparture: Array.from(item.operatesAsDeparture).sort(),
        operatesAsArrival: Array.from(item.operatesAsArrival).sort(),
        shuttle: {
          available: item.availableIn.has('shuttle'),
          dayTypes: Array.from(item.shuttleDayTypes).sort()
        },
        campus: {
          available: item.availableIn.has('campus'),
          dayTypes: Array.from(item.campusDayTypes).sort(),
          directions: Array.from(item.campusDirections).sort()
        }
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    res.json({
      total: stops.length,
      filters: {
        dayType: dayType || null
      },
      stops
    });
  } catch (e) {
    res.status(500).json({ message: '통합 정류장 목록 조회 오류', error: e.message });
  }
};

