import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * Middleware to validate request body, query, or params against a Zod schema.
 * Returns a 400 response with detailed validation errors if check fails.
 */
export const validate = (schema: AnyZodObject) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const appError: AppError = new Error('Validation Failed');
        appError.status = 400;
        appError.code = 'VALIDATION_ERROR';
        appError.details = error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        return next(appError);
      }
      return next(error);
    }
  };
