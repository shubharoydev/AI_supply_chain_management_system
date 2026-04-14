/**
 * Utility functions for error handling
 */

/**
 * Creates a custom error object with additional properties
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Custom error object
 */
export const createError = (statusCode, message, details = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    error.details = details;
    
    if (Error.captureStackTrace) {
        Error.captureStackTrace(error, createError);
    }
    
    return error;
};

/**
 * Creates a 400 Bad Request error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Bad Request error
 */
export const badRequest = (message = 'Bad Request', details = null) => {
    return createError(400, message, details);
};

/**
 * Creates a 401 Unauthorized error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Unauthorized error
 */
export const unauthorized = (message = 'Unauthorized', details = null) => {
    return createError(401, message, details);
};

/**
 * Creates a 403 Forbidden error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Forbidden error
 */
export const forbidden = (message = 'Forbidden', details = null) => {
    return createError(403, message, details);
};

/**
 * Creates a 404 Not Found error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Not Found error
 */
export const notFound = (message = 'Not Found', details = null) => {
    return createError(404, message, details);
};

/**
 * Creates a 409 Conflict error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Conflict error
 */
export const conflict = (message = 'Conflict', details = null) => {
    return createError(409, message, details);
};

/**
 * Creates a 422 Unprocessable Entity error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Unprocessable Entity error
 */
export const unprocessableEntity = (message = 'Unprocessable Entity', details = null) => {
    return createError(422, message, details);
};

/**
 * Creates a 429 Too Many Requests error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Too Many Requests error
 */
export const tooManyRequests = (message = 'Too Many Requests', details = null) => {
    return createError(429, message, details);
};

/**
 * Creates a 500 Internal Server Error
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Internal Server Error
 */
export const internalServerError = (message = 'Internal Server Error', details = null) => {
    return createError(500, message, details);
};
