type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  ts: string;
  level: LogLevel;
  service: string;
  event: string;
  [key: string]: unknown;
}

function stringifyData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }
  try {
    return JSON.stringify(data);
  } catch {
    return JSON.stringify({ note: 'log_data_not_serializable' });
  }
}

function write(line: string, level: LogLevel): void {
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

function log(level: LogLevel, service: string, event: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development') {
    const icon: Record<LogLevel, string> = {
      info: '✓',
      warn: '⚠',
      error: '✗',
      debug: '·',
    };
    const details = stringifyData(data);
    write(`${icon[level]} [${service}] ${event}${details ? ` ${details}` : ''}`, level);
    return;
  }

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    service,
    event,
    ...(data ?? {}),
  };
  write(JSON.stringify(entry), level);
}

export const logger = {
  info(service: string, event: string, data?: Record<string, unknown>): void {
    log('info', service, event, data);
  },
  warn(service: string, event: string, data?: Record<string, unknown>): void {
    log('warn', service, event, data);
  },
  error(service: string, event: string, data?: Record<string, unknown>): void {
    log('error', service, event, data);
  },
  debug(service: string, event: string, data?: Record<string, unknown>): void {
    log('debug', service, event, data);
  },
};
