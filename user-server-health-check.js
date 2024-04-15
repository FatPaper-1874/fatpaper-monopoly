const http = require('http');

const options = {
    hostname: 'user-server',
    port: 83,
    path: '/health',
    method: 'GET',
};

const req = http.request(options, (res) => {
    console.log(`状态码: ${res.statusCode}`);
    if (res.statusCode === 200) {
        console.log('服务健康');
        process.exit(0);
    } else {
        console.log('服务不健康');
        // 在这里处理服务不健康的情况，例如重试或退出;
        process.exit(1);
    }
});

req.on('error', (error) => {
    console.error('健康检查请求出错:', error);
    process.exit(1);
});

req.end();