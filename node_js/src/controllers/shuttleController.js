const ShuttleRoute = require('../models/ShuttleRoute');
const ShuttleBus = require('../models/ShuttleBus');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

const SHUTTLE_DAY_TYPE_GROUPS = [
  {
    display: '평일',
    matchValues: ['평일'],
    aliases: ['평일', '주중']
  },
  {
    display: '토요일/공휴일',
    matchValues: ['토요일/공휴일'],
    aliases: ['토요일/공휴일', '토요일', '공휴일', '주말']
  },
  {
    display: '일요일',
    matchValues: ['일요일', '토요일/공휴일'],
    aliases: ['일요일', '일']
  }
];

const buildDayTypeMatchStage = (dayTypes) => {
  if (!dayTypes || dayTypes.length === 0) return null;
  if (dayTypes.length === 1) return { dayType: dayTypes[0] };
  return { dayType: { $in: dayTypes } };
};

const normalizeShuttleDayTypes = (raw) => {
  if (!raw) return null;

  const displaySet = new Set();
  const matchSet = new Set();

  String(raw)
    .split(',')
    .map((token) => token && token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const group = SHUTTLE_DAY_TYPE_GROUPS.find(({ display, aliases }) =>
        [display, ...(aliases || [])].includes(token)
      );

      if (group) {
        displaySet.add(group.display);
        group.matchValues.forEach((value) => matchSet.add(value));
      } else {
        displaySet.add(token);
        matchSet.add(token);
      }
    });

  if (displaySet.size === 0) return null;

  return {
    display: Array.from(displaySet),
    match: Array.from(matchSet)
  };
};

// 셔틀정보 전체 조회
exports.getShuttleRoutes = async (req, res) => {
  try {
    const { busType, dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeShuttleDayTypes(dayType);
    const filter = {};
    if (busType) filter.busType = busType;
    if (normalizedDayTypes?.match?.length) {
      if (normalizedDayTypes.match.length === 1) {
        filter.dayType = normalizedDayTypes.match[0];
      } else {
        filter.dayType = { $in: normalizedDayTypes.match };
      }
    } else if (dayType) {
      filter.dayType = dayType;
    }
    const list = await ShuttleRoute.find(filter);
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: '조회 오류', error: e.message });
  }
};

// 셔틀정보 상세 조회
exports.getShuttleRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const route = await ShuttleRoute.findOne({ routeId });
    if (!route) return res.status(404).json({ message: '셔틀정보 없음' });
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
    const normalizedDayTypes = normalizeShuttleDayTypes(dayType);
    if (normalizedDayTypes?.match?.length) {
      if (normalizedDayTypes.match.length === 1) {
        filter.dayType = normalizedDayTypes.match[0];
      } else {
        filter.dayType = { $in: normalizedDayTypes.match };
      }
    } else if (dayType) {
      const dayTypes = dayType.split(',').map((d) => d.trim());
      if (dayTypes.length === 1) {
        filter.dayType = dayTypes[0];
      } else {
        filter.dayType = { $in: dayTypes };
      }
    }
    
    // 경유지도 출발지로 검색 가능
    if (departure) {
      filter.$or = [
        { departure: departure },
        { 'viaStops.name': departure }
      ];
    }
    
    // 경유지도 도착지로 검색 가능
    if (arrival) {
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: [
            { arrival: arrival },
            { 'viaStops.name': arrival }
          ]}
        ];
        delete filter.$or;
      } else {
        filter.$or = [
          { arrival: arrival },
          { 'viaStops.name': arrival }
        ];
      }
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

    // 페이징 처리
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
        dayType: normalizedDayTypes?.display
          ? normalizedDayTypes.display.join(',')
          : (dayType || null),
        departure: departure || null,
        arrival: arrival || null,
        startTime: startTime || null,
        endTime: endTime || null
      },
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

// 셔틀버스 시간표 메타 정보 조회
exports.getShuttleScheduleMeta = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeShuttleDayTypes(dayType);
    const dayTypeFilter = normalizedDayTypes?.match || null;

    const matchStages = [];
    if (dayTypeFilter && dayTypeFilter.length > 0) {
      const matchCondition = buildDayTypeMatchStage(dayTypeFilter);
      if (matchCondition) matchStages.push({ $match: matchCondition });
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

// 셔틀버스 정류장 목록 조회
exports.getShuttleStops = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeShuttleDayTypes(dayType);
    const matchCondition = buildDayTypeMatchStage(normalizedDayTypes?.match);

    const shuttlePipeline = [];
    if (matchCondition) shuttlePipeline.push({ $match: matchCondition });
    shuttlePipeline.push(
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
    );

    const [aggregatedRaw] = await ShuttleBus.aggregate(shuttlePipeline);
    const aggregated = aggregatedRaw || { departures: [], arrivals: [] };

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

    // 경유지 수집
    const viaStopsPipeline = [];
    if (matchCondition) viaStopsPipeline.push({ $match: matchCondition });
    viaStopsPipeline.push(
      { $unwind: '$viaStops' },
      {
        $group: {
          _id: { stop: '$viaStops.name', dayType: '$dayType' }
        }
      }
    );
    const viaStopsData = await ShuttleBus.aggregate(viaStopsPipeline);

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
        busType: 'shuttle',
        dayTypes: Array.from(item.dayTypes).sort(),
        operatesAsDeparture: Array.from(item.departureDayTypes).sort(),
        operatesAsArrival: Array.from(item.arrivalDayTypes).sort()
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    res.json({
      total: stops.length,
      filters: {
        dayType: normalizedDayTypes?.display
          ? normalizedDayTypes.display.join(',')
          : (dayType || null)
      },
      stops
    });
  } catch (e) {
    res.status(500).json({ message: '정류장 목록 조회 오류', error: e.message });
  }
};

