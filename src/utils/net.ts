/** Geçici ağ hatalarında artan beklemeyle yeniden dener. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  tries = 3,
  baseMs = 800,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < tries - 1) {
        await new Promise<void>(r => setTimeout(r, baseMs * 2 ** i));
      }
    }
  }
  throw last;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const ctrl = new AbortController();
  const outer = init.signal;
  if (outer) {
    if (outer.aborted) {
      ctrl.abort();
    } else {
      outer.addEventListener('abort', () => ctrl.abort());
    }
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctrl.signal});
  } catch (e) {
    if (ctrl.signal.aborted && !(outer && outer.aborted)) {
      throw new Error('Sunucu zaman aşımına uğradı.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
