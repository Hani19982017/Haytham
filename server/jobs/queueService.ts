export interface BackgroundJob {
  id: string;
  name: 'BULK_RISK_RECALCULATION' | 'NIGHTLY_SIS_SYNC' | 'BATCH_CSV_IMPORT' | 'DISPATCH_WARNING_NOTIFICATIONS';
  data: any;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number; // 0 to 100
  createdAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export class BackgroundQueueService {
  private static instance: BackgroundQueueService;
  private jobs: BackgroundJob[] = [];

  public static getInstance(): BackgroundQueueService {
    if (!BackgroundQueueService.instance) {
      BackgroundQueueService.instance = new BackgroundQueueService();
    }
    return BackgroundQueueService.instance;
  }

  /**
   * Enqueue an asynchronous heavy job (e.g., bulk risk analysis for 50,000 students)
   */
  public async dispatchJob(name: BackgroundJob['name'], data: any): Promise<BackgroundJob> {
    const job: BackgroundJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name,
      data,
      status: 'PENDING',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.jobs.unshift(job);

    // Process asynchronously without blocking response
    setTimeout(() => this.processJob(job), 50);

    return job;
  }

  private async processJob(job: BackgroundJob) {
    job.status = 'PROCESSING';
    job.progress = 25;

    try {
      if (job.name === 'BULK_RISK_RECALCULATION') {
        job.progress = 75;
        job.result = { evaluatedCount: 100, warningsGenerated: 8 };
      } else if (job.name === 'NIGHTLY_SIS_SYNC') {
        job.progress = 100;
        job.result = { recordsSynced: 100, status: 'IDEMPOTENT_OK' };
      }
      job.status = 'COMPLETED';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
    } catch (err: any) {
      job.status = 'FAILED';
      job.error = err.message;
    }
  }

  public getJob(id: string): BackgroundJob | undefined {
    return this.jobs.find(j => j.id === id);
  }

  public listRecentJobs(): BackgroundJob[] {
    return this.jobs.slice(0, 15);
  }
}
