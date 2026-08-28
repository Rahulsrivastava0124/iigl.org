export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new ApiError(400, m, 'bad_request');
export const unauthorized = (m = 'Sign in to continue.') => new ApiError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this.') => new ApiError(403, m, 'forbidden');
export const notFound = (m = 'Not found.') => new ApiError(404, m, 'not_found');
export const conflict = (m: string) => new ApiError(409, m, 'conflict');
