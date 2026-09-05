import 'server-only';

export async function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Request timed out'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Only ever used for idempotent, non-billable calls (status polls) — never
 * wrap a paid submit() call, since retrying it could start a second
 * generation job if the first request actually reached the provider.
 */
export async function retryOnce<T>(fn: () => Promise<T>, delayMs = 400): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}
