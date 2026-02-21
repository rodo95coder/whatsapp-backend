import PQueue from 'p-queue';

const queue = new PQueue({
  concurrency: 1,
  interval: 1000,
  intervalCap: 1
});

export function enqueueSession(task) {
  return queue.add(task);
}
