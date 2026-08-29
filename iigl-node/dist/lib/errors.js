export class ApiError extends Error {
    status;
    code;
    constructor(status, message, code = 'error') {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export const badRequest = (m) => new ApiError(400, m, 'bad_request');
export const unauthorized = (m = 'Sign in to continue.') => new ApiError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this.') => new ApiError(403, m, 'forbidden');
export const notFound = (m = 'Not found.') => new ApiError(404, m, 'not_found');
export const conflict = (m) => new ApiError(409, m, 'conflict');
