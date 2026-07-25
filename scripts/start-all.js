import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['server.js'], {
    cwd: new URL('../xtrace', import.meta.url),
    stdio: 'inherit'
  }),
  spawn(process.execPath, ['backend/src/index.js'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit'
  })
];

let exiting = false;
function stop(signal = 'SIGTERM') {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', (code) => {
    if (!exiting && code !== 0) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
