"use strict";

const Workers = require("./worker/Workers.js");
const WorkerResult = require("./worker/WorkerResult.js");
const Queue = require("./queue/Queue.js");
const QueueItem = require("./queue/QueueItem.js");

function Pool (opts) {
  this.opts = opts || {};
  this.max = this.opts.max || require("os").cpus().length;
  this.queueMax = this.opts.queueMax || 10;

  let queue = new Queue({ max: this.queueMax });
  let workers = new Workers(queue);

  this.getSize = function () {
    return workers.getSize();
  };

  this.enqueue = function (method, ...args) {
    return new Promise((resolve, reject) => {
      try {
        let workerFree = workers.getFreeWorker();
        if (workerFree !== undefined) {
          workerFree.run(method.toString(), args, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        } else if (this.getSize() < this.max) {
          workers.createWorker(method.toString(), args, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        } else {
          this.Allocate(method.toString(), args, (err, result) => {
            if (err) {
              reject(err);
            } else {
              resolve(result);
            }
          });
        }
      } catch (err) {
        let workerResult = new WorkerResult(err.message, null);
        reject(workerResult.err);
      }
    });
  };

  this.Allocate = function (method, args, callback) {
    /* Add task in queue */
    let queueAddResult = queue.add(new QueueItem(method, args, callback));

    if (queueAddResult !== "") {
      let workerResult = new WorkerResult();
      workerResult.err = queueAddResult;
      workerResult.result = null;
      callback(workerResult.err, workerResult.result);
    }
  };

  this.finishPool = function () {
    return new Promise((resolve, reject) => {
      try {
        queue.clearQueue();
        workers.terminateAll();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };

  this.getState = function () {
    const workersState = workers.getState();
    let hasFreeWorker = true;

    if (workersState.length > 0) {
      const qtdWorkers = workersState.filter(value => !value.busy).length;
      if (qtdWorkers <= 0) {
        hasFreeWorker = this.max > this.getSize();
      }
    }

    const obj = {
      size: this.getSize(),
      maxSize: this.max,
      hasFreeWorker: hasFreeWorker,
      queueSize: queue.getSize(),
      queueMaxSize: this.queueMax,
      workers: workersState
    };

    return obj;
  };

}

function createPool (opts) {
  const usePanel = opts.usePanel || false;
  const pool = new Pool(opts);
  if (usePanel) {
    require("./adm/server").createAdmPanel(pool);
  }
  return pool;
}

module.exports = {
  createPool
};
