module.exports = {
  apps: [
    {
      name: 'api',
      script: 'pnpm',
      args: '--filter @school/api start',
      env: {
        API_PORT: '3001',
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000,
    },
    {
      name: 'web',
      script: 'pnpm',
      args: '--filter @school/web start',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000,
    },
    {
      name: 'worker',
      script: 'node',
      args: 'apps/worker/dist/apps/worker/src/main.js',
      env: {
        NODE_ENV: 'production',
        WORKER_PORT: '5556',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 5000,
    },
  ],
};
