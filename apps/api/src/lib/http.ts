import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

/** Wraps an async handler so rejected promises reach the error middleware. */
export const h = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
export function oid(value: unknown, name = 'id'): string {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return value;
}
