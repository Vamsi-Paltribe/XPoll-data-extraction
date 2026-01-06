import { Queue } from 'bullmq';
import connection from './connection';
import { QUEUE_NAME } from './worker';

// Create and export the shared queue instance
export const imageQueue = new Queue(QUEUE_NAME, { connection: connection as any });
