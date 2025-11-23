const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const { getMultipleStopCoordinates } = require('../services/busStopCoordinateService');

const STOP_DAY_TYPE_GROUPS = [
  {
    display: '평일',
    shuttleValues: ['평일'],
    campusValues: ['월~목', '월~목요일'],
    aliases: ['평일', '주중']
  },
  {
    display: '토요일/공휴일',
    shuttleValues: ['토요일/공휴일'],
    campusValues: [],
    aliases: ['토요일/공휴일', '토요일', '공휴일', '주말', '토']
  },
  {
    display: '일요일',
    shuttleValues: ['일요일'],
    campusValues: [],
    aliases: ['일요일', '일']
  },
  {
    display: '월~목',
    shuttleValues: [],
    campusValues: ['월~목', '월~목요일'],
    aliases: ['월~목', '월~목요일', '월', '화', '수', '목']
  },
  {
    display: '금요일',
    shuttleValues: [],
    campusValues: ['금요일', '금'],
    aliases: ['금요일', '금']
  }
];

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

const buildMatchCondition = (dayTypes) => {
  if (!dayTypes || dayTypes.length === 0) return null;
  if (dayTypes.length === 1) return { dayType: dayTypes[0] };
  return { dayType: { $in: dayTypes } };
};

const normalizeStopDayTypes = (raw) => {
  if (!raw) {
    return { display: null, shuttle: null, campus: null };
  }

  const displaySet = new Set();
  const shuttleSet = new Set();
  const campusSet = new Set();

  String(raw)
    .split(',')
    .map((token) => token && token.trim())
    .filter(Boolean)
    .forEach((token) => {
      const group = STOP_DAY_TYPE_GROUPS.find(({ display, aliases }) =>
        [display, ...(aliases || [])].includes(token)
      );

      if (group) {
        displaySet.add(group.display);
        group.shuttleValues.forEach((value) => shuttleSet.add(value));
        group.campusValues.forEach((value) => campusSet.add(value));
      } else {
        displaySet.add(token);
        shuttleSet.add(token);
        campusSet.add(token);
      }
    });

  return {
    display: displaySet.size ? Array.from(displaySet) : null,
    shuttle: shuttleSet.size ? Array.from(shuttleSet) : null,
    campus: campusSet.size ? Array.from(campusSet) : null
  };
};

// 통합 정류장 목록 조회
exports.getAllStops = async (req, res) => {
  try {
    const { dayType } = mergeRequestParams(req);
    const normalizedDayTypes = normalizeStopDayTypes(dayType);
    const shuttleMatchCondition = buildMatchCondition(normalizedDayTypes.shuttle);
    const campusMatchCondition = buildMatchCondition(normalizedDayTypes.campus);

    // 셔틀버스 정류장 수집
    const shouldQueryShuttle = !dayType || !!shuttleMatchCondition;
    let shuttleAggregated = { departures: [], arrivals: [] };
    let shuttleViaStops = [];

    if (shouldQueryShuttle) {
      const shuttlePipeline = [];
      if (shuttleMatchCondition) shuttlePipeline.push({ $match: shuttleMatchCondition });
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
      const [shuttleAggregatedRaw] = await ShuttleBus.aggregate(shuttlePipeline);
      shuttleAggregated = shuttleAggregatedRaw || { departures: [], arrivals: [] };

      const shuttleViaPipeline = [];
      if (shuttleMatchCondition) shuttleViaPipeline.push({ $match: shuttleMatchCondition });
      shuttleViaPipeline.push(
        { $unwind: '$viaStops' },
        {
          $group: {
            _id: { stop: '$viaStops.name', dayType: '$dayType' }
          }
        }
      );
      shuttleViaStops = await ShuttleBus.aggregate(shuttleViaPipeline);
    }

    // 통학버스 정류장 수집
    const shouldQueryCampus = !dayType || !!campusMatchCondition;
    let campusAggregated = { departures: [], arrivals: [] };
    let campusViaStops = [];

    if (shouldQueryCampus) {
      const campusPipeline = [];
      if (campusMatchCondition) campusPipeline.push({ $match: campusMatchCondition });
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
      const [campusAggregatedRaw] = await CampusBus.aggregate(campusPipeline);
      campusAggregated = campusAggregatedRaw || { departures: [], arrivals: [] };

      const campusViaPipeline = [];
      if (campusMatchCondition) campusViaPipeline.push({ $match: campusMatchCondition });
      campusViaPipeline.push(
        { $unwind: '$viaStops' },
        {
          $group: {
            _id: { stop: '$viaStops.name', dayType: '$dayType', direction: '$direction' }
          }
        }
      );
      campusViaStops = await CampusBus.aggregate(campusViaPipeline);
    }

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

    // 추가 정류장 (셔틀버스에서 사용 가능)
    const additionalStops = ['충남 아산시 선문대 정류소', '선문대학생회관 앞'];
    additionalStops.forEach(stopName => {
      const stop = ensureStop(stopName);
      // 셔틀버스에서 사용 가능
      stop.availableIn.add('shuttle');
      stop.shuttleDayTypes.add('평일');
      stop.dayTypes.add('평일');
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

    // 정류장 좌표 정보 조회
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
        dayType: normalizedDayTypes.display
          ? normalizedDayTypes.display.join(',')
          : null
      },
      stops: stopsWithCoordinates
    });
  } catch (e) {
    console.error('통합 정류장 목록 조회 오류:', e);
    res.status(500).json({ 
      message: '통합 정류장 목록 조회 중 오류가 발생했습니다.',
      error: e.message,
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
};

