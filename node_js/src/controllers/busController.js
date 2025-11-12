const ShuttleRoute = require('../models/ShuttleRoute');
const ShuttleBus = require('../models/ShuttleBus');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

// 버스정보 전체 조회
exports.getBusRoutes = async (req, res) => {
  try {
    const { busType, dayType } = mergeRequestParams(req);
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

// 셔틀버스 시간표 조회
exports.getShuttleSchedules = async (req, res) => {
  try {
    const {
      dayType,
      departure,
      arrival,
      fridayOperates,
      includeFridayOff = 'true',
      startTime,
      endTime,
      limit,
      page
    } = mergeRequestParams(req);

    const filter = {};
    
    // 여러 요일 동시 조회 지원
    if (dayType) {
      const dayTypes = dayType.split(',').map(d => d.trim());
      if (dayTypes.length === 1) {
        filter.dayType = dayTypes[0];
      } else {
        filter.dayType = { $in: dayTypes };
      }
    }
    
    if (departure) filter.departure = departure;
    
    // 경유지도 도착지로 검색 가능
    if (arrival) {
      filter.$or = [
        { arrival: arrival },
        { 'viaStops.name': arrival }
      ];
    }

    // 금요일 운행 필터
    if (fridayOperates === 'true') filter.fridayOperates = true;
    else if (fridayOperates === 'false') filter.fridayOperates = false;
    else if (includeFridayOff === 'false') filter.fridayOperates = true;

    // 시간대 필터
    if (startTime || endTime) {
      filter.departureTime = {};
      if (startTime) {
        const [startHour, startMin] = startTime.split(':').map(Number);
        filter.departureTime.$gte = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
      }
      if (endTime) {
        const [endHour, endMin] = endTime.split(':').map(Number);
        filter.departureTime.$lte = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      }
    }

    // limit이 0이거나 없으면 전체 반환, 있으면 페이징
    const pageSize = Math.min(Number(limit) || 0, 200);
    const pageNumber = Math.max(Number(page) || 1, 1);

    const query = ShuttleBus.find(filter).sort({ dayType: 1, departure: 1, departureTime: 1 });
    if (pageSize > 0) {
      query.limit(pageSize).skip(pageSize * (pageNumber - 1));
    }

    const schedules = await query.exec();
    const total = await ShuttleBus.countDocuments(filter);

    res.json({
      total,
      count: schedules.length,
      page: pageSize > 0 ? pageNumber : null,
      limit: pageSize > 0 ? pageSize : null,
      filters: {
        dayType: dayType || null,
        departure: departure || null,
        arrival: arrival || null,
        startTime: startTime || null,
        endTime: endTime || null
      },
      // 경유지 목록 요약
      viaStopsSummary: schedules
        .filter(s => s.viaStops && s.viaStops.length > 0)
        .flatMap(s => s.viaStops.map(v => v.name))
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .sort(),
      data: schedules
    });
  } catch (e) {
    res.status(500).json({ message: '시간표 조회 오류', error: e.message });
  }
};

// 셔틀버스 시간표 메타 정보
exports.getShuttleScheduleMeta = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const dayTypeFilter = dayType
      ? Array.from(new Set(dayType.split(',').map((d) => d.trim()).filter(Boolean)))
      : null;

    const matchStages = [];
    if (dayTypeFilter && dayTypeFilter.length > 0) {
      matchStages.push({ $match: { dayType: { $in: dayTypeFilter } } });
    }

    const distinctDayTypes = dayTypeFilter && dayTypeFilter.length > 0
      ? dayTypeFilter
      : await ShuttleBus.distinct('dayType');

    const departures = await ShuttleBus.aggregate([
      ...matchStages,
      { $unwind: { path: '$viaStops', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { dayType: '$dayType', departure: '$departure' },
          arrivals: { $addToSet: '$arrival' },
          viaStops: { $addToSet: '$viaStops.name' }
        }
      },
      { $sort: { '_id.dayType': 1, '_id.departure': 1 } }
    ]);

    const formatted = departures.map(({ _id, arrivals, viaStops }) => {
      // 경유지도 도착지 목록에 포함
      const validViaStops = (viaStops || []).filter(Boolean);
      const allArrivals = [...new Set([...arrivals, ...validViaStops])].sort();
      return {
        dayType: _id.dayType,
        departure: _id.departure,
        arrivals: allArrivals,
        viaStops: validViaStops.sort()
      };
    });

    const result = distinctDayTypes.map((type) => ({
      dayType: type,
      departures: formatted.filter((item) => item.dayType === type)
    }));

    res.json({
      dayTypes: distinctDayTypes,
      departures: result
    });
  } catch (e) {
    res.status(500).json({ message: '시간표 메타 조회 오류', error: e.message });
  }
};

// 셔틀 정류장 목록 조회
exports.getShuttleStops = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);

    const matchStage = {};
    if (dayType) matchStage.dayType = dayType;

    const [aggregated] = await ShuttleBus.aggregate([
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

    const stopMap = new Map();

    const ensureStop = (name) => {
      if (!stopMap.has(name)) {
        stopMap.set(name, {
          name,
          dayTypes: new Set(),
          departureDayTypes: new Set(),
          arrivalDayTypes: new Set()
        });
      }
      return stopMap.get(name);
    };

    (aggregated.departures || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.dayTypes.add(_id.dayType);
      stop.departureDayTypes.add(_id.dayType);
    });

    (aggregated.arrivals || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.dayTypes.add(_id.dayType);
      stop.arrivalDayTypes.add(_id.dayType);
    });

    // 경유지도 정류장 목록에 포함
    const viaStopsData = await ShuttleBus.aggregate([
      { $match: matchStage },
      { $unwind: '$viaStops' },
      {
        $group: {
          _id: { stop: '$viaStops.name', dayType: '$dayType' }
        }
      }
    ]);

    viaStopsData.forEach(({ _id }) => {
      if (_id.stop) {
        const stop = ensureStop(_id.stop);
        stop.dayTypes.add(_id.dayType);
        stop.arrivalDayTypes.add(_id.dayType);
      }
    });

    const stops = Array.from(stopMap.values())
      .map((item) => ({
        name: item.name,
        dayTypes: Array.from(item.dayTypes).sort(),
        operatesAsDeparture: Array.from(item.departureDayTypes).sort(),
        operatesAsArrival: Array.from(item.arrivalDayTypes).sort()
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
    res.status(500).json({ message: '정류장 목록 조회 오류', error: e.message });
  }
};
