//ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "whatsapp-backend",
      script: "./index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
      },

      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      merge_logs: true,
    },
  ],
};