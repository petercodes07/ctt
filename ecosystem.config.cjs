module.exports = {
  apps: [
    {
      name: 'ctt-backend',
      script: 'scraper_service.js',
      cwd: '/opt/ctt-backend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 15000,
      out_file: '/var/log/ctt-backend/out.log',
      error_file: '/var/log/ctt-backend/error.log',
      time: true,
      env: {
        NODE_ENV: 'production',
        SCRAPER_SERVICE_HOST: '127.0.0.1',
        SCRAPER_SERVICE_PORT: '9090',
        AUTO_FETCH_ENABLED: 'true',
        AUTO_FETCH_ON_START: 'true',
        AUTO_FETCH_INTERVAL_MINUTES: '360',
        AUTO_FETCH_LIMIT: '3'
      }
    }
  ]
};
