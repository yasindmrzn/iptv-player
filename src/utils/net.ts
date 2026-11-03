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
