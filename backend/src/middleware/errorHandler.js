export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (request, _response, next) => {
  next(new AppError(404, `Route ${request.method} ${request.originalUrl} not found`));
};

export const errorHandler = (error, request, response, _next) => {
  const statusCode = error.statusCode || 500;
  request.log.error({ err: error, statusCode }, "request_failed");
  response.status(statusCode).json({
    error: statusCode === 500 ? "Internal server error" : error.message,
    details: error.details,
    requestId: request.id,
  });
};

