const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

// 서버 URL 자동 감지 또는 환경 변수 사용
const getServerUrl = () => {
  // 환경 변수가 설정되어 있으면 사용
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  
  // 상대 경로를 기본값으로 사용 (브라우저가 자동으로 현재 호스트 사용)
  return '/api';
};

const serverUrl = getServerUrl();
const servers = [];

// 상대 경로 추가 (항상 포함)
servers.push({
  url: '/api',
  description: '현재 서버 (상대 경로)'
});

// 절대 경로가 상대 경로가 아닌 경우에만 추가
if (serverUrl !== '/api' && serverUrl.startsWith('http')) {
  servers.push({
    url: serverUrl,
    description: '개발 서버 (절대 경로)'
  });
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '셔틀버스 API',
      version: '1.0.0',
      description: '선문대학교 셔틀버스 시간표 및 정류장 정보 API',
      contact: {
        name: 'API Support'
      }
    },
    servers: servers,
    tags: [
      {
        name: 'Auth',
        description: '인증 관련 API'
      },
      {
        name: 'Shuttle Routes',
        description: '셔틀버스 노선 및 시간표 조회'
      },
      {
        name: 'Shuttle Schedules',
        description: '셔틀버스 시간표 조회'
      },
      {
        name: 'Shuttle Stops',
        description: '셔틀버스 정류장 정보'
      },
      {
        name: 'Campus Bus Routes',
        description: '통학버스 노선 및 시간표 조회'
      },
      {
        name: 'Campus Bus Schedules',
        description: '통학버스 시간표 조회'
      },
      {
        name: 'Campus Bus Stops',
        description: '통학버스 정류장 정보'
      },
      {
        name: 'Stops',
        description: '통합 정류장 목록 조회'
      },
      {
        name: 'Timetable',
        description: '시간표 조회'
      },
      {
        name: 'Notices',
        description: '공지사항'
      },
      {
        name: 'Congestion',
        description: '혼잡도 관리 (리포트 저장, 조회, 집계)'
      },
      {
        name: 'Bus Route Time',
        description: '버스 경로 및 도착 시간 계산'
      },
      {
        name: 'Admin',
        description: '관리자 기능'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT 토큰을 입력하세요. 로그인 API로 토큰을 발급받을 수 있습니다.'
        }
      },
      schemas: {
        ShuttleSchedule: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: '스케줄 ID'
            },
            departure: {
              type: 'string',
              description: '출발지'
            },
            arrival: {
              type: 'string',
              description: '도착지'
            },
            departureTime: {
              type: 'string',
              description: '출발 시간 (HH:mm)'
            },
            arrivalTime: {
              type: 'string',
              nullable: true,
              description: '도착 시간 (HH:mm)'
            },
            dayType: {
              type: 'string',
              enum: ['평일', '토요일/공휴일', '일요일'],
              description: '운행 요일'
            },
            fridayOperates: {
              type: 'boolean',
              description: '금요일 운행 여부'
            },
            note: {
              type: 'string',
              description: '특이사항'
            },
            viaStops: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: '경유지 이름'
                  },
                  time: {
                    type: 'string',
                    nullable: true,
                    description: '경유지 도착 시간 (HH:mm). 이 시간은 해당 경유지에 도착하는 시간이자, 동시에 그 경유지에서 출발하는 시간입니다. 예: 출발지에서 08:00 출발, 경유지 A에 08:30 도착(및 출발), 최종 도착지에 09:00 도착'
                  },
                  source: {
                    type: 'string',
                    enum: ['table', 'note'],
                    description: '경유지 정보 출처'
                  }
                }
              },
              description: '경유지 목록'
            },
            studentHallBoardingAvailable: {
              type: 'boolean',
              description: '학생회관 탑승 가능 여부'
            }
          }
        },
        CampusSchedule: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: '스케줄 ID'
            },
            departure: {
              type: 'string',
              description: '출발지'
            },
            arrival: {
              type: 'string',
              description: '도착지'
            },
            departureTime: {
              type: 'string',
              description: '출발 시간 (HH:mm)'
            },
            arrivalTime: {
              type: 'string',
              nullable: true,
              description: '도착 시간 (HH:mm)'
            },
            direction: {
              type: 'string',
              enum: ['등교', '하교'],
              description: '방향'
            },
            dayType: {
              type: 'string',
              enum: ['평일', '월~목', '금요일', '토요일/공휴일', '일요일'],
              description: '운행 요일'
            },
            note: {
              type: 'string',
              description: '특이사항'
            },
            viaStops: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: '경유지 이름'
                  },
                  time: {
                    type: 'string',
                    nullable: true,
                    description: '경유지 도착 시간 (HH:mm). 이 시간은 해당 경유지에 도착하는 시간이자, 동시에 그 경유지에서 출발하는 시간입니다. 예: 출발지에서 08:00 출발, 경유지 A에 08:30 도착(및 출발), 최종 도착지에 09:00 도착'
                  },
                  source: {
                    type: 'string',
                    enum: ['table', 'note'],
                    description: '경유지 정보 출처'
                  }
                }
              },
              description: '경유지 목록'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [path.join(__dirname, '../routes/*.js')]
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerSetup = (app) => {
  app.get('/api-json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  
  app.use('/api', swaggerUi.serve);
  app.get('/api', swaggerUi.setup(swaggerSpec, {
    customSiteTitle: '셔틀버스 API 문서',
    swaggerOptions: {
      persistAuthorization: true,
      tryItOutEnabled: true,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
      validatorUrl: null,
      docExpansion: 'list'
    }
  }));
};

module.exports = { swaggerSetup, swaggerSpec };

