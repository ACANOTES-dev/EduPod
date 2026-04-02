module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: 'node',
      args: 'dist/api/src/main.js',
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
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5551',
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
