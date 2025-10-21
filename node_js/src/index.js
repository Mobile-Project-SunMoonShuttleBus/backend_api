const http = require('http');

const PORT = process.env.SERVER_PORT || 8080;

const HOST = '0.0.0.0'; 

const server = http.createServer((req, res) => {
    
    if (req.url === '/') {
        res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8' 
        });
        res.write('<h1>Hello World</h1>');
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, HOST, () => {
    console.log('서버 실행중');
});