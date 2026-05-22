import store from "./session-store.js";

export function isSessionShuttingDown(companyId) {
  const runtime = store.getRuntime(companyId);

  if (!runtime) {
    return true;
  }

  return runtime.shutdown?.inProgress === true;
}

export function validateActiveSession(companyId) {
  if (isSessionShuttingDown(companyId)) {
    return false;
  }

  return true;
}