const CampusBus = require('../models/CampusBus');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

const CAMPUS_DAY_TYPE_GROUPS = [
  {
    display: '월~목',
    matchValues: ['월~목', '월~목요일', '평일'],
    aliases: ['월~목', '월~목요일', '평일']
  },
  {
    display: '금요일',
    matchValues: ['금요일'],
    aliases: ['금요일', '금']
  }
];

const buildDayTypeMatchStage = (dayTypes) => {
  if (!dayTypes || dayTypes.length === 0) return null;
  if (dayTypes.length === 1) return { dayType: dayTypes[0] };
  return { dayType: { $in: dayTypes } };
};

// 통학버스 노선 전체 조회 (CampusBus에서 출발지/도착지 조합 추출)
exports.getCampusRoutes = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeCampusDayTypes(dayType);
    
    // CampusBus에서 필터링
    const busFilter = {};
    if (normalizedDayTypes?.match?.length) {
      if (normalizedDayTypes.match.length === 1) {
        busFilter.dayType = normalizedDayTypes.match[0];
      } else {
        busFilter.dayType = { $in: normalizedDayTypes.match };
      }
    }
    
    // 출발지/도착지 조합 추출
    const buses = await CampusBus.find(busFilter).select('departure arrival dayType direction').lean();
    
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
          dayTypes: new Set(),
          directions: new Set()
        });
      }
      routeMap.get(key).dayTypes.add(bus.dayType);
      routeMap.get(key).directions.add(bus.direction);
    });
    
    // 배열로 변환 및 dayTypes, directions를 배열로 변환
    const routes = Array.from(routeMap.values()).map(route => ({
      routeId: route.routeId,
      routeName: route.routeName,
      departure: route.departure,
      arrival: route.arrival,
      dayTypes: Array.from(route.dayTypes).sort(),
      directions: Array.from(route.directions).sort()
    }));
    
    res.json(routes);
  } catch (e) {
    console.error('통학버스 노선 조회 오류:', e);
    res.status(500).json({ 
      message: '통학버스 노선 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

const normalizeCampusDayTypes = (raw) => {
  if (!raw) return null;

  const displaySet = new Set();
  const matchSet = new Set();

  String(raw)
    .split(',')
    .map((token) => token && token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const group = CAMPUS_DAY_TYPE_GROUPS.find(({ display, aliases }) =>
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

// 통학버스 시간표 조회
exports.getCampusSchedules = async (req, res) => {
  try {
    const requestParams = mergeRequestParams(req);
    const {
      dayType,
      departure,
      arrival,
      direction,
      startTime,
      endTime,
      limit,
      page
    } = requestParams;

    const filter = {};
    const normalizedDayTypes = normalizeCampusDayTypes(dayType);
    
    // 여러 요일 동시 조회 지원
    if (normalizedDayTypes?.match?.length) {
      if (normalizedDayTypes.match.length === 1) {
        filter.dayType = normalizedDayTypes.match[0];
      } else {
        filter.dayType = { $in: normalizedDayTypes.match };
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

    if (direction) filter.direction = direction;

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

    const query = CampusBus.find(filter).sort({ direction: 1, dayType: 1, departure: 1, departureTime: 1 });
    if (pageSize > 0) {
      query.limit(pageSize).skip(pageSize * (pageNumber - 1));
    }

    const schedules = await query.exec();
    const total = await CampusBus.countDocuments(filter);

    const allStopNames = new Set();
    schedules.forEach(schedule => {
      if (schedule.departure) allStopNames.add(schedule.departure);
      if (schedule.arrival) allStopNames.add(schedule.arrival);
      if (schedule.viaStops && Array.isArray(schedule.viaStops)) {
        schedule.viaStops.forEach(via => {
          if (via.name) allStopNames.add(via.name);
        });
      }
    });

    const { getMultipleStopCoordinates } = require('../services/busStopCoordinateService');
    const coordinatesMap = await getMultipleStopCoordinates(Array.from(allStopNames));

    const formattedSchedules = schedules.map(schedule => {
      const scheduleObj = schedule.toObject ? schedule.toObject() : schedule;
      const arrivalTime = scheduleObj.arrivalTime;
      
      const departureCoords = coordinatesMap[scheduleObj.departure];
      const departureCoordinates = departureCoords ? {
        latitude: departureCoords.latitude,
        longitude: departureCoords.longitude,
        naverPlaceId: departureCoords.naverPlaceId || null,
        address: departureCoords.address || null,
        title: departureCoords.title || null
      } : null;

      const arrivalCoords = coordinatesMap[scheduleObj.arrival];
      const arrivalCoordinates = arrivalCoords ? {
        latitude: arrivalCoords.latitude,
        longitude: arrivalCoords.longitude,
        naverPlaceId: arrivalCoords.naverPlaceId || null,
        address: arrivalCoords.address || null,
        title: arrivalCoords.title || null
      } : null;

      const viaStopsWithCoordinates = scheduleObj.viaStops && Array.isArray(scheduleObj.viaStops) 
        ? scheduleObj.viaStops.map(via => {
            const viaCoords = coordinatesMap[via.name];
            return {
              ...via,
              coordinates: viaCoords ? {
                latitude: viaCoords.latitude,
                longitude: viaCoords.longitude,
                naverPlaceId: viaCoords.naverPlaceId || null,
                address: viaCoords.address || null,
                title: viaCoords.title || null
              } : null
            };
          })
        : [];

      return {
        ...scheduleObj,
        arrivalTime: (arrivalTime !== null && arrivalTime !== undefined && arrivalTime !== 'X') ? arrivalTime : 'X',
        departureCoordinates,
        arrivalCoordinates,
        viaStops: viaStopsWithCoordinates
      };
    });

    res.json({
      total,
      count: formattedSchedules.length,
      page: pageSize > 0 ? pageNumber : null,
      limit: pageSize > 0 ? pageSize : null,
      filters: {
        dayType: normalizedDayTypes?.display
          ? normalizedDayTypes.display.join(',')
          : null,
        departure: departure || null,
        arrival: arrival || null,
        direction: direction || null,
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
    console.error('통학버스 시간표 조회 오류:', e);
    res.status(500).json({ 
      message: '통학버스 시간표 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

// 통학버스 시간표 메타 정보 조회
exports.getCampusScheduleMeta = async (req, res) => {
  try {
    const params = mergeRequestParams(req);
    const normalizedDayTypes = normalizeCampusDayTypes(params.dayType);

    const matchStages = [];
    if (normalizedDayTypes?.match?.length) {
      const matchCondition = buildDayTypeMatchStage(normalizedDayTypes.match);
      if (matchCondition) matchStages.push({ $match: matchCondition });
    }

    // DB에 실제로 존재하는 dayType만 사용
    const allDayTypes = await CampusBus.distinct('dayType');
    const distinctDayTypes = normalizedDayTypes?.match?.length
      ? normalizedDayTypes.match.filter(type => allDayTypes.includes(type))
      : allDayTypes;

    const departures = await CampusBus.aggregate([
      ...matchStages,
      { $unwind: { path: '$viaStops', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { dayType: '$dayType', departure: '$departure', direction: '$direction' },
          arrivals: { $addToSet: '$arrival' },
          viaStops: { $addToSet: '$viaStops.name' }
        }
      },
      { $sort: { '_id.dayType': 1, '_id.direction': 1, '_id.departure': 1 } }
    ]);

    const formatted = departures.map(({ _id, arrivals, viaStops }) => {
      const validViaStops = (viaStops || []).filter(Boolean);
      const allArrivals = [...new Set([...arrivals, ...validViaStops])].sort();
      return {
        dayType: _id.dayType,
        direction: _id.direction,
        departure: _id.departure,
        arrivals: allArrivals,
        viaStops: validViaStops.sort()
      };
    });

    const result = distinctDayTypes.map((type) => ({
      dayType: type,
      directions: [
        {
          direction: '등교',
          departures: formatted.filter((item) => item.dayType === type && item.direction === '등교')
        },
        {
          direction: '하교',
          departures: formatted.filter((item) => item.dayType === type && item.direction === '하교')
        }
      ]
    }));

    res.json({
      dayTypes: distinctDayTypes,
      departures: result
    });
  } catch (e) {
    console.error('통학버스 시간표 메타 조회 오류:', e);
    res.status(500).json({ 
      message: '통학버스 시간표 메타 정보 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

// 통학버스 정류장 목록 조회
exports.getCampusStops = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeCampusDayTypes(dayType);
    const matchCondition = buildDayTypeMatchStage(normalizedDayTypes?.match);

    const campusPipeline = [];
    if (matchCondition) campusPipeline.push({ $match: matchCondition });
    campusPipeline.push(
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
    );

    const [aggregatedRaw] = await CampusBus.aggregate(campusPipeline);
    const aggregated = aggregatedRaw || { departures: [], arrivals: [] };

    const stopMap = new Map();

    const ensureStop = (name) => {
      if (!stopMap.has(name)) {
        stopMap.set(name, {
          name,
          dayTypes: new Set(),
          directions: new Set(),
          departureDayTypes: new Set(),
          arrivalDayTypes: new Set()
        });
      }
      return stopMap.get(name);
    };

    (aggregated.departures || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.dayTypes.add(_id.dayType);
      stop.directions.add(_id.direction);
      stop.departureDayTypes.add(_id.dayType);
    });

    (aggregated.arrivals || []).forEach(({ _id }) => {
      const stop = ensureStop(_id.stop);
      stop.dayTypes.add(_id.dayType);
      stop.directions.add(_id.direction);
      stop.arrivalDayTypes.add(_id.dayType);
    });

    // 경유지 수집
    const viaStopsPipeline = [];
    if (matchCondition) viaStopsPipeline.push({ $match: matchCondition });
    viaStopsPipeline.push(
      { $unwind: '$viaStops' },
      {
        $group: {
          _id: { stop: '$viaStops.name', dayType: '$dayType', direction: '$direction' }
        }
      }
    );
    const viaStopsData = await CampusBus.aggregate(viaStopsPipeline);

    viaStopsData.forEach(({ _id }) => {
      if (_id.stop) {
        const stop = ensureStop(_id.stop);
        stop.dayTypes.add(_id.dayType);
        stop.directions.add(_id.direction);
        stop.arrivalDayTypes.add(_id.dayType);
      }
    });

    const stops = Array.from(stopMap.values())
      .map((item) => ({
        name: item.name,
        busType: 'campus',
        dayTypes: Array.from(item.dayTypes).sort(),
        directions: Array.from(item.directions).sort(),
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
          : null
      },
      stops: stopsWithCoordinates
    });
  } catch (e) {
    console.error('통학버스 정류장 목록 조회 오류:', e);
    res.status(500).json({ 
      message: '통학버스 정류장 목록 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

