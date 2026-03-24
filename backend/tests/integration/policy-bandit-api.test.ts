import { ChildProcess, spawn, spawnSync } from 'child_process';
import path from 'path';
import request from 'supertest';

const ML_PORT = 5011;
const ML_BASE_URL = `http://127.0.0.1:${ML_PORT}`;
const TEST_TIMEOUT_MS = 90_000;

interface MlStatsResponse {
  stats: {
    contexts: Record<string, Array<{ arm: number; alpha: number; beta: number; expected_value: number }>>;
  };
}

async function waitForMlHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Service not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`ML service did not become healthy within ${timeoutMs}ms`);
}

async function mlPost<T>(pathName: string, payload: unknown): Promise<T> {
  const response = await fetch(`${ML_BASE_URL}${pathName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST ${pathName} failed with ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

async function mlGet<T>(pathName: string): Promise<T> {
  const response = await fetch(`${ML_BASE_URL}${pathName}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${pathName} failed with ${response.status}: ${body}`);
  }
  return (await response.json()) as T;
}

function getContextArmBeta(stats: MlStatsResponse, contextKey: string, arm: number): number {
  const contextArms = stats.stats.contexts[contextKey];
  if (!contextArms) {
    throw new Error(`Context ${contextKey} missing in stats`);
  }
  const armStats = contextArms.find((entry) => entry.arm === arm);
  if (!armStats) {
    throw new Error(`Arm ${arm} missing for context ${contextKey}`);
  }
  return armStats.beta;
}

function resolvePythonRunner(): { command: string; prefixArgs: string[] } {
  const envCandidate = process.env.PYTHON_BIN;
  const candidates = [
    ...(envCandidate ? [envCandidate] : []),
    ...(process.platform === 'win32'
      ? ['python', 'py', 'C:\\Python313\\python.exe']
      : ['python3', 'python']),
  ];

  for (const command of candidates) {
    const prefixArgs = command === 'py' ? ['-3'] : [];
    const result = spawnSync(command, [...prefixArgs, '--version'], { stdio: 'ignore' });
    if (result.status === 0) {
      return { command, prefixArgs };
    }
  }

  throw new Error('No usable Python runtime found for integration tests');
}

describe('Policy Bandit API integration', () => {
  jest.setTimeout(TEST_TIMEOUT_MS);

  let mlProcess: ChildProcess;
  let app: any;

  beforeAll(async () => {
    const mlServiceDir = path.resolve(__dirname, '../../../', 'ml-service');
    const python = resolvePythonRunner();
    const pythonArgs = [...python.prefixArgs, 'app.py'];

    mlProcess = spawn(python.command, pythonArgs, {
      cwd: mlServiceDir,
      env: {
        ...process.env,
        PORT: String(ML_PORT),
        BANDIT_DISABLE_DB: '1',
      },
      stdio: 'ignore',
    });

    await waitForMlHealth(ML_BASE_URL, 20_000);

    process.env.ML_SERVICE_URL = ML_BASE_URL;
    const appModule = await import('../../src/app');
    app = appModule.createApp();
  });

  afterAll(() => {
    if (mlProcess && !mlProcess.killed) {
      mlProcess.kill();
    }
  });

  test('/recommend-tier returns a valid arm 0-3', async () => {
    const response = await mlPost<{
      recommended_arm: number;
      recommended_premium: number;
      recommended_coverage: number;
      context_key: string;
    }>('/recommend-tier', {
      worker_id: '00000000-0000-0000-0000-000000000111',
      context: {
        platform: 'zomato',
        city: 'mumbai',
        experience_tier: 'veteran',
        season: 'monsoon',
        zone_risk: 'high',
      },
    });

    expect(response.recommended_arm).toBeGreaterThanOrEqual(0);
    expect(response.recommended_arm).toBeLessThanOrEqual(3);
    expect([29, 44, 65, 89]).toContain(response.recommended_premium);
    expect([290, 440, 640, 890]).toContain(response.recommended_coverage);
  });

  test('/bandit-update returns updated alpha/beta values', async () => {
    const contextKey = 'zomato_mumbai_veteran_monsoon_high';

    const update = await mlPost<{
      success: boolean;
      new_alpha: number;
      new_beta: number;
    }>('/bandit-update', {
      worker_id: '00000000-0000-0000-0000-000000000112',
      context_key: contextKey,
      arm: 2,
      reward: 1.0,
    });

    expect(update.success).toBe(true);
    expect(update.new_alpha).toBeGreaterThan(1.0);
    expect(update.new_beta).toBeGreaterThanOrEqual(1.0);
  });

  test('after 20 purchases of arm 1, /recommend-tier returns arm 1 > 60% over 50 trials', async () => {
    const context = {
      platform: 'swiggy',
      city: 'delhi',
      experience_tier: 'mid',
      season: 'winter',
      zone_risk: 'medium',
    };
    const contextKey = 'swiggy_delhi_mid_winter_medium';

    for (let i = 0; i < 20; i += 1) {
      await mlPost('/bandit-update', {
        worker_id: `00000000-0000-0000-0000-000000001${i.toString().padStart(2, '0')}`,
        context_key: contextKey,
        arm: 1,
        reward: 1.0,
      });
    }

    let arm1Count = 0;
    for (let i = 0; i < 50; i += 1) {
      const rec = await mlPost<{ recommended_arm: number }>('/recommend-tier', {
        worker_id: `00000000-0000-0000-0000-000000002${i.toString().padStart(2, '0')}`,
        context,
      });

      if (rec.recommended_arm === 1) {
        arm1Count += 1;
      }
    }

    expect(arm1Count).toBeGreaterThan(30);
  });

  test('reward=0.0 is sent on session exit beacon flow', async () => {
    const workerId = '00000000-0000-0000-0000-000000000999';
    const contextKey = 'zomato_chennai_new_summer_low';
    const arm = 0;

    await mlPost('/bandit-update', {
      worker_id: workerId,
      context_key: contextKey,
      arm,
      reward: 1.0,
    });

    const beforeStats = await mlGet<MlStatsResponse>('/bandit-stats');
    const beforeBeta = getContextArmBeta(beforeStats, contextKey, arm);

    await request(app)
      .post('/api/policies/session-exit')
      .set('Content-Type', 'text/plain')
      .send(
        JSON.stringify({
          worker_id: workerId,
          context_key: contextKey,
          arm,
        })
      )
      .expect(204);

    const afterStats = await mlGet<MlStatsResponse>('/bandit-stats');
    const afterBeta = getContextArmBeta(afterStats, contextKey, arm);

    expect(afterBeta).toBe(beforeBeta + 1);
  });
});
