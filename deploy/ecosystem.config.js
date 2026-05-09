/**
 * PM2 configuration
 * Usage : pm2 start deploy/ecosystem.config.js
 */
module.exports = {
  apps: [{
    name: 'liste-naissance',
    script: 'server/index.js',
    cwd: __dirname + '/..',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
    },
    out_file: './logs/out.log',
    error_file: './logs/err.log',
    merge_logs: true,
    time: true,
  }],
};
