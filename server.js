//
// simple random number server with metrics and logs
//

const package = require("./package.json");
const express = require("express");
const os = require("os");
const chance = require("chance").Chance();
const winston = require("winston");
const state = { isReady: false };
var debuglevel="debug";
if (process.env.DEBUGLEVEL) debuglevel=process.env.DEBUGLEVEL;

// setup express worker
const worker = express();
const workerPort = 3000;

// create a JSON info object with some application information 
const info = {
  launchDate: new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }),
  serverName: chance.first() + " the " + chance.animal(),
  appName: package.name,
  serverVersion: package.version
};

// setup logging
const logLevels = { // inspired by Grafana https://grafana.com/docs/grafana/latest/packages_api/data/loglevel/
  levels: {
    critical: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
    trace: 5,
  }
};
const logger = winston.createLogger({
  levels: logLevels.levels,
  defaultMeta: {
    app: package.name,
    server: info.serverName,
    version: package.version,
  },
  transports: [
    new winston.transports.Console({ level: debuglevel }), 
  ],
});
logger.critical("testing critical");
logger.error("testing error");
logger.warning("testing warning");
logger.info("testing info");
logger.debug("testing debug");
logger.trace("testing trace");

// setup metrics 
const promBundle = require("express-prom-bundle");
const metricsMiddleware = promBundle({
  includePath: true,
  includeMethod: true,
  includeUp: true,
  metricsPath: "/service/metrics",
  httpDurationMetricName: package.name + "_http_request_duration_seconds",
});
worker.use("/*", metricsMiddleware);
const prom = require("prom-client");
const infoGauge = new prom.Gauge({
  name: package.name + "_server_info",
  help: package.name + " server info provides build and runtime information",
  labelNames: [
    "launchDate",
    "serverName",
    "appName",
    "serverVersion",
  ],
});
infoGauge.set(info, 1);
prom.register.metrics();

// readyz handler
worker.get("/service/readyz", (req, res) => {
  logger.trace("/service/readyz");   // using trace since it's a lot of traffic
  if(state.isReady) {
    logger.trace("/service/readyz: service is ready to receive traffic");
    res.status(200).json({status:"ok"});
  }
  else {
    logger.info("/service/readyz: service is not ready to receive traffic");
    res.status(500).json({status:"not ok"});
  }
});

// livez handler 
worker.get("/service/livez", (req, res) => {
  logger.trace("/service/livez"); // using trace since it's a lot of traffic
  res.status(200).json({status:"ok"});
});

// info handler
worker.get("/service/info", (req, res) => {
  logger.info("/service/info");
  res.status(200).json(info);
});

// random handler
worker.get("/service/random", (req, res) => { 
  logger.info("/service/random");
  var r=Math.floor((Math.random()*100));
  logger.debug("random value generated: "+r);
  res.status(200).json({ random: r });
});

// wait 10 seconds until ready, for no reason other than demonstration.
// App is not supposed to receive traffic until it is ready.
setTimeout(ready, 10000);

// start listening
worker.listen(workerPort, () => {
  logger.info(JSON.stringify(info));
  logger.info("Debug Level is " + debuglevel);
  logger.info("\"" + info.serverName + "\" started listening on http://localhost:" + workerPort + "/service/");
});

// handle SIGTERM for graceful exit
process.on('SIGTERM', function onSigterm () {
  logger.info("Got SIGTERM. Graceful shutdown initiated, 10 seconds timeout.");
  state.isReady=false;
  // Giving application service 10 seconds (more than periodTime x failureThreshhold in the manifest)
  // No more calls should be coming to this instance after /readyz returns 500 2x 
  // In this time other cleanup can be done, such as DB connection or files closing.
  // Good discussion here: https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/
  setTimeout(shutdown, 10000); 
})

// exit after shutdown timeout
function shutdown() {
  logger.info("Process Exit due to timeout elapsed after SIGTERM.");
  process.exit()
}

// setting the ready flag to true after the launch timeout triggered
function ready() {
  logger.info("App is ready to receive traffic");
  state.isReady=true;
}
