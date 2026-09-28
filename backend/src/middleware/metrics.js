import client from "prom-client";

client.collectDefaultMetrics({ prefix: "opsboard_" });

const requestDuration = new client.Histogram({
  name: "opsboard_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

export const metricsMiddleware = (request, response, next) => {
  const end = requestDuration.startTimer();
  response.on("finish", () => {
    end({
      method: request.method,
      route: request.route?.path || request.path || "unknown",
      status_code: String(response.statusCode),
    });
  });
  next();
};

export const metricsHandler = async (_request, response) => {
  response.set("Content-Type", client.register.contentType);
  response.end(await client.register.metrics());
};

