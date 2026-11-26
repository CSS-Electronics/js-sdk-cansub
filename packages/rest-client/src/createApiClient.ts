import { Configuration, DefaultApi } from './generated';
import { createQueuedFetch } from './queuedFetch';

/**
 * Create a DefaultApi instance with built-in serial request queue.
 *
 * All HTTP requests made through the returned client are automatically
 * serialized through a FIFO queue, ensuring at most one request is
 * in flight at any time.
 *
 * @param basePath - Base URL for API requests (default: '' for relative paths)
 */
export function createApiClient(basePath: string = ''): DefaultApi {
  const config = new Configuration({
    basePath,
    fetchApi: createQueuedFetch(),
  });
  return new DefaultApi(config);
}
