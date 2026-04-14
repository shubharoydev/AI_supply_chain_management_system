export const errorHandler = (err, req, res, next) => {
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;

    // Prepare safe error response (never leak stack in production)
    const response = {
        success: false,
        error: {
            message: err.message || 'Internal Server Error',
            code: err.code || 'INTERNAL_ERROR',
            status: statusCode,
        },
    };

    // In development → include stack trace & more context
    if (process.env.NODE_ENV !== 'production') {
        response.error.stack = err.stack;
        response.error.details = err.details || null;
    }

    // Log the error
    console.error('Error:', {
        message: err.message,
        status: statusCode,
        path: req.originalUrl,
        method: req.method,
        stack: err.stack,
        details: err.details || null,
    });

    // Common known error types → better messages
    if (err.name === 'ValidationError') {
        response.error.message = 'Validation failed';
        response.error.details = err.errors || err.details;
        return res.status(400).json(response);
    }

    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        response.error.message = 'Authentication failed';
        response.error.code = 'AUTH_ERROR';
        return res.status(401).json(response);
    }

    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        response.error.message = 'Invalid ID format';
        response.error.code = 'INVALID_ID';
        return res.status(400).json(response);
    }

    // Rate limiting / Arcjet / other 4xx
    if (statusCode === 429) {
        response.error.message = 'Too many requests – please try again later';
        response.error.code = 'RATE_LIMIT_EXCEEDED';
    }

    // Final response
    res.status(statusCode).json(response);
};