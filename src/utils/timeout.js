// src/utils/timeout.js

export async function withTimeout(
  promise,
  ms = 15000,
  message = "Timeout exceeded",
) {
  let timeoutId;

  try {
    return await Promise.race([
      promise,

      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message));
        }, ms);
      }),
    ]);

  } finally {
    clearTimeout(timeoutId);
  }
}