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
                    description: '경유지 도착 시간 (HH:mm)'
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
  
  app.use('/api', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
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

