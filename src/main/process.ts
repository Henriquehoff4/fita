import { spawn, type ChildProcess } from 'node:child_process';

export const CHILD_ENV = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

export function spawnHidden(command: string, args: string[]): ChildProcess {
  return spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: CHILD_ENV, shell: false });
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
  } else {
    child.kill('SIGTERM');
  }
}

export function eachLine(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n|\r/);
    buffer = parts.pop() ?? '';
    parts.forEach((line) => line && onLine(line));
  });
  stream.on('end', () => {
    if (buffer) onLine(buffer);
  });
}

export function runForOutput(command: string, args: string[], timeoutMs = 15000): Promise<string | null> {
  return new Promise((resolve) => {
    let output = '';
    let child: ChildProcess;
    try {
      child = spawnHidden(command, args);
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => killTree(child), timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => (output += chunk));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? output : null);
    });
  });
}
