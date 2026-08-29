/** Wraps an async handler so a rejected promise reaches the error middleware. */
export const wrap = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
