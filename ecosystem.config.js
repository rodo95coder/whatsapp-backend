//ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'whatsapp-backend',
      script: './index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
