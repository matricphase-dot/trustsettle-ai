// Zod request body validation middleware
const { ZodError } = require('zod');

function validate(schema) {
  return (req, res, next) => {
    try {
      req.validated = schema.parse(req.body || {});
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: err.errors.map(e => `${e.path.join('.') || 'body'}: ${e.message}`).join('; '),
          code: 'VALIDATION_ERROR',
          details: err.errors,
        });
      }
      next(err);
    }
  };
}

module.exports = validate;
