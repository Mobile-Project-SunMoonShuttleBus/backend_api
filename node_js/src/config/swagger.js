const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

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
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:8080',
        description: '개발 서버'
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
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerSetup = (app) => {
  app.use('/api', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: '셔틀버스 API 문서'
  }));
};

module.exports = { swaggerSetup, swaggerSpec };

