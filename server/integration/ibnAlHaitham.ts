import { Student, Course, CourseOffering } from '../../src/types/index.js';

export interface SyncJobLog {
  id: string;
  sourceSystem: string;
  jobType: 'NIGHTLY_BATCH_SYNC' | 'MANUAL_IMPORT' | 'REALTIME_WEBHOOK';
  startedAt: string;
  completedAt?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STANDBY_UNCONFIGURED';
  recordsImported: number;
  recordsUpdated: number;
  recordsRejected: number;
  errors: string[];
}

export interface IIbnAlHaythamDataProvider {
  testConnection(): Promise<{ connected: boolean; latencyMs: number; sisVersion: string; error?: string }>;
  fetchNightlyIncrementalSync(): Promise<{ students: Partial<Student>[]; courses: Partial<Course>[] }>;
  pushApprovedRegistrations(registrations: { studentCode: string; courseCodes: string[]; termCode: string }[]): Promise<{ success: boolean; syncedCount: number }>;
  getSyncHistory(): Promise<SyncJobLog[]>;
}

export class IbnAlHaythamDataProvider implements IIbnAlHaythamDataProvider {
  private static instance: IbnAlHaythamDataProvider;
  private syncLogs: SyncJobLog[] = [];

  public static getInstance(): IbnAlHaythamDataProvider {
    if (!IbnAlHaythamDataProvider.instance) {
      IbnAlHaythamDataProvider.instance = new IbnAlHaythamDataProvider();
    }
    return IbnAlHaythamDataProvider.instance;
  }

  /**
   * Resilient executor with exponential backoff retry
   */
  private async executeWithRetry<T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 500): Promise<T> {
    let lastError: any;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, delayMs * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw lastError;
  }

  /**
   * Health ping to University Ibn Al-Haitham API endpoint
   */
  public async testConnection(): Promise<{ connected: boolean; latencyMs: number; sisVersion: string; error?: string }> {
    const apiUrl = process.env.IBN_ALHAITHAM_API_URL;
    if (!apiUrl) {
      return {
        connected: false,
        latencyMs: 0,
        sisVersion: 'DISCONNECTED',
        error: 'REAL IBN AL-HAITHAM LIVE INTEGRATION IS NOT VERIFIED: IBN_ALHAITHAM_API_URL is not configured.',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const start = performance.now();

    try {
      const response = await fetch(`${apiUrl}/api/v1/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.IBN_ALHAITHAM_API_KEY || ''}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const latency = Math.round(performance.now() - start);

      if (!response.ok) {
        return {
          connected: false,
          latencyMs: latency,
          sisVersion: 'UNKNOWN',
          error: `Ibn Al-Haitham gateway responded with HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as any;
      return {
        connected: true,
        latencyMs: latency,
        sisVersion: data.version || 'Ibn Al-Haitham SIS Gateway v4.8',
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        connected: false,
        latencyMs: Math.round(performance.now() - start),
        sisVersion: 'DISCONNECTED',
        error: `Ibn Al-Haitham network connection error: ${err.message}`,
      };
    }
  }

  /**
   * Idempotent Nightly Synchronization batch runner
   */
  public async fetchNightlyIncrementalSync(): Promise<{ students: Partial<Student>[]; courses: Partial<Course>[] }> {
    const apiUrl = process.env.IBN_ALHAITHAM_API_URL;
    const jobLog: SyncJobLog = {
      id: `sync_${Date.now()}`,
      sourceSystem: 'Ibn-AlHaitham-SIS',
      jobType: 'NIGHTLY_BATCH_SYNC',
      startedAt: new Date().toISOString(),
      status: 'RUNNING',
      recordsImported: 0,
      recordsUpdated: 0,
      recordsRejected: 0,
      errors: [],
    };

    if (!apiUrl) {
      jobLog.status = 'STANDBY_UNCONFIGURED';
      jobLog.completedAt = new Date().toISOString();
      jobLog.errors.push('REAL IBN AL-HAITHAM LIVE INTEGRATION IS NOT VERIFIED: University endpoint IBN_ALHAITHAM_API_URL not provided.');
      this.syncLogs.unshift(jobLog);
      return { students: [], courses: [] };
    }

    try {
      const result = await this.executeWithRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(`${apiUrl}/api/v1/sync/incremental`, {
            headers: { 'Authorization': `Bearer ${process.env.IBN_ALHAITHAM_API_KEY || ''}` },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          return await res.json() as { students: Partial<Student>[]; courses: Partial<Course>[] };
        } finally {
          clearTimeout(timeout);
        }
      });

      jobLog.status = 'COMPLETED';
      jobLog.completedAt = new Date().toISOString();
      jobLog.recordsUpdated = (result.students?.length || 0) + (result.courses?.length || 0);
      this.syncLogs.unshift(jobLog);
      return result;
    } catch (err: any) {
      jobLog.status = 'FAILED';
      jobLog.completedAt = new Date().toISOString();
      jobLog.errors.push(err.message || 'Sync error');
      this.syncLogs.unshift(jobLog);
      throw err;
    }
  }

  /**
   * Push student registration decisions verified by Rules Engine back to SIS
   */
  public async pushApprovedRegistrations(
    registrations: { studentCode: string; courseCodes: string[]; termCode: string }[]
  ): Promise<{ success: boolean; syncedCount: number }> {
    const apiUrl = process.env.IBN_ALHAITHAM_API_URL;
    if (!apiUrl) {
      return {
        success: false,
        syncedCount: 0,
      };
    }

    return this.executeWithRetry(async () => {
      const res = await fetch(`${apiUrl}/api/v1/registrations/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.IBN_ALHAITHAM_API_KEY || ''}`,
        },
        body: JSON.stringify({ registrations }),
      });
      if (!res.ok) throw new Error(`SIS sync failed with status ${res.status}`);
      return { success: true, syncedCount: registrations.length };
    });
  }

  public async getSyncHistory(): Promise<SyncJobLog[]> {
    return this.syncLogs;
  }
}
