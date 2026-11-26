/**
 * Creates a fetch function that serializes all requests through a FIFO queue.
 *
 * The CANsub device has limited socket slots and expensive TLS handshakes.
 * This wrapper ensures at most one HTTP request is in flight at any time,
 * enabling HTTP keep-alive connection reuse.
 */
export function createQueuedFetch(): typeof fetch {
  interface QueueItem {
    execute: () => Promise<Response>;
    resolve: (value: Response) => void;
    reject: (error: unknown) => void;
  }

  const queue: QueueItem[] = [];
  let processing = false;

  async function processNext(): Promise<void> {
    if (processing || queue.length === 0) return;
    processing = true;
    const item = queue.shift()!;
    try {
      item.resolve(await item.execute());
    } catch (error) {
      item.reject(error);
    } finally {
      processing = false;
      processNext();
    }
  }

  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((resolve, reject) => {
      queue.push({ execute: () => fetch(input, init), resolve, reject });
      processNext();
    });
  };
}
