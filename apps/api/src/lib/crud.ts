import { Router } from 'express';
import type { Model } from 'mongoose';
import type { ZodObject, ZodRawShape } from 'zod';
import { h, notFound, oid } from './http';

interface CrudOptions<S extends ZodRawShape> {
  schema: ZodObject<S>;
  /** Query-string keys that may filter the list, e.g. productionId. */
  filters: string[];
  sort?: Record<string, 1 | -1>;
  /** Extra fields set from the request when a record is created. */
  onCreate?: (req: import('express').Request) => Record<string, unknown>;
}

/** List / create / update / delete for a simple collection scoped by a parent id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function crud<S extends ZodRawShape>(M: Model<any>, o: CrudOptions<S>): Router {
  const r = Router();
  r.get('/', h(async (req, res) => {
    const where: Record<string, string> = {};
    for (const key of o.filters) if (req.query[key]) where[key] = oid(req.query[key], key);
    res.json(await M.find(where).sort(o.sort ?? { createdAt: -1 }).limit(500).lean());
  }));
  r.post('/', h(async (req, res) => {
    res.status(201).json(await M.create({ ...o.schema.parse(req.body), ...o.onCreate?.(req) }));
  }));
  r.patch('/:id', h(async (req, res) => {
    const doc = await M.findByIdAndUpdate(oid(req.params.id), o.schema.partial().parse(req.body), { new: true, runValidators: true });
    if (!doc) throw notFound();
    res.json(doc);
  }));
  r.delete('/:id', h(async (req, res) => {
    const doc = await M.findByIdAndDelete(oid(req.params.id));
    if (!doc) throw notFound();
    res.status(204).end();
  }));
  return r;
}
