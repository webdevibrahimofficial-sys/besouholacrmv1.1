module.exports = {
  apps: [{
    name: 'wa-mirror-service',
    script: './src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
  }],
};
