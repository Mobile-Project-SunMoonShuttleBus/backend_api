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

// 셔틀정보 전체 조회 (ShuttleBus에서 출발지/도착지 조합 추출)
exports.getShuttleRoutes = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeShuttleDayTypes(dayType);
    
    // ShuttleBus에서 필터링
    const busFilter = {};
    if (normalizedDayTypes?.match?.length) {
      if (normalizedDayTypes.match.length === 1) {
        busFilter.dayType = normalizedDayTypes.match[0];
      } else {
        busFilter.dayType = { $in: normalizedDayTypes.match };
      }
    } else if (dayType) {
      busFilter.dayType = dayType;
    }
    
    // 출발지/도착지 조합 추출
    const buses = await ShuttleBus.find(busFilter).select('departure arrival dayType').lean();
    
    // 고유한 출발지/도착지 조합 추출
    const routeMap = new Map();
    buses.forEach(bus => {
      const key = `${bus.departure}-${bus.arrival}`;
      if (!routeMap.has(key)) {
        routeMap.set(key, {
          routeId: key,
          routeName: `${bus.departure} → ${bus.arrival}`,
          departure: bus.departure,
          arrival: bus.arrival,
          dayTypes: new Set()
        });
      }
      routeMap.get(key).dayTypes.add(bus.dayType);
    });
    
    // 배열로 변환 및 dayTypes를 배열로 변환
    const routes = Array.from(routeMap.values()).map(route => ({
      routeId: route.routeId,
      routeName: route.routeName,
      departure: route.departure,
      arrival: route.arrival,
      dayTypes: Array.from(route.dayTypes).sort()
    }));
    
    res.json(routes);
  } catch (e) {
    console.error('셔틀 노선 조회 오류:', e);
    res.status(500).json({ 
      message: '셔틀 노선 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
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

    // 시간대 필터 (startTime만 사용, 해당 시간 이상의 출발시간만 반환)
    if (startTime) {
      const [startHour, startMin] = startTime.split(':').map(Number);
      filter.departureTime = {
        $gte: `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`
      };
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

    // arrivalTime이 null이거나 undefined이거나 빈 문자열이면 X로 변환, 그 외에는 실제 값 반환
    const formattedSchedules = schedules.map(schedule => {
      const scheduleObj = schedule.toObject ? schedule.toObject() : schedule;
      const arrivalTime = scheduleObj.arrivalTime;
      // 실제 도착시간이 있으면 그대로 반환 (null, undefined, 빈 문자열, 'X'만 'X'로 변환)
      if (arrivalTime && arrivalTime !== 'X' && arrivalTime !== null && arrivalTime !== undefined && String(arrivalTime).trim() !== '') {
        return {
          ...scheduleObj,
          arrivalTime: arrivalTime
        };
      } else {
        return {
          ...scheduleObj,
          arrivalTime: 'X'
        };
      }
    });

    res.json({
      total,
      count: formattedSchedules.length,
      page: pageSize > 0 ? pageNumber : null,
      limit: pageSize > 0 ? pageSize : null,
      filters: {
        dayType: normalizedDayTypes?.display
          ? normalizedDayTypes.display.join(',')
          : (dayType || null),
        departure: departure || null,
        arrival: arrival || null,
        startTime: startTime || null
      },
      viaStopsSummary: formattedSchedules
        .filter(s => s.viaStops && s.viaStops.length > 0)
        .flatMap(s => s.viaStops.map(v => v.name))
        .filter((name, idx, arr) => arr.indexOf(name) === idx)
        .sort(),
      data: formattedSchedules
    });
  } catch (e) {
    console.error('셔틀버스 시간표 조회 오류:', e);
    res.status(500).json({ 
      message: '셔틀버스 시간표 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
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
    console.error('셔틀버스 시간표 메타 조회 오류:', e);
    res.status(500).json({ 
      message: '셔틀버스 시간표 메타 정보 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
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

    // 정류장 좌표 정보 조회
    const { getMultipleStopCoordinates } = require('../services/busStopCoordinateService');
    const stopNames = stops.map(s => s.name);
    const coordinatesMap = await getMultipleStopCoordinates(stopNames);

    // 좌표 정보 추가
    const stopsWithCoordinates = stops.map(stop => {
      const coordinates = coordinatesMap[stop.name];
      return {
        ...stop,
        coordinates: coordinates ? {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          naverPlaceId: coordinates.naverPlaceId || null,
          address: coordinates.address || null,
          title: coordinates.title || null
        } : null
      };
    });

    res.json({
      total: stopsWithCoordinates.length,
      filters: {
        dayType: normalizedDayTypes?.display
          ? normalizedDayTypes.display.join(',')
          : (dayType || null)
      },
      stops: stopsWithCoordinates
    });
  } catch (e) {
    console.error('셔틀버스 정류장 목록 조회 오류:', e);
    res.status(500).json({ 
      message: '셔틀버스 정류장 목록 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

