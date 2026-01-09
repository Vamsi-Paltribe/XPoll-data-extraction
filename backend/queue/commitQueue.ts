import { Queue } from 'bullmq';
import connection from './connection';

export const COMMIT_QUEUE_NAME = 'data-commit-queue';

export const commitQueue = new Queue(COMMIT_QUEUE_NAME, { connection: connection as any });
