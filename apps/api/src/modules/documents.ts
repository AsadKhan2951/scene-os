import { Router } from 'express';
import { documentSchema, presignSchema } from '@sceneos/shared';
import { ProductionDocument } from '../models';
import { me } from '../middleware/auth';
import { h, notFound, oid } from '../lib/http';
import { audit } from '../lib/audit';
import { presignDownload, presignUpload, removeObject } from '../lib/spaces';

/**
 * Document vault. Files go straight from the browser to DigitalOcean Spaces with a
 * short-lived signed URL; MongoDB only keeps the metadata.
 */
export const documentsRouter = Router();

documentsRouter.get('/', h(async (req, res) => {
  const where = req.query.productionId ? { productionId: oid(req.query.productionId, 'productionId') } : {};
  res.json(await ProductionDocument.find(where).sort({ createdAt: -1 }).limit(500).lean());
}));

documentsRouter.post('/presign', h(async (req, res) => {
  const { productionId, fileName, mimeType } = presignSchema.parse(req.body);
  res.json(await presignUpload(productionId, fileName, mimeType));
}));

documentsRouter.post('/', h(async (req, res) => {
  res.status(201).json(await ProductionDocument.create({ ...documentSchema.parse(req.body), uploadedBy: me(req).name }));
}));

documentsRouter.get('/:id/download', h(async (req, res) => {
  const doc = await ProductionDocument.findById(oid(req.params.id)).lean();
  if (!doc) throw notFound('Document');
  res.json({ url: await presignDownload(doc.storageKey, doc.fileName) });
}));

documentsRouter.delete('/:id', h(async (req, res) => {
  const doc = await ProductionDocument.findByIdAndDelete(oid(req.params.id));
  if (!doc) throw notFound('Document');
  await removeObject(doc.storageKey).catch((err) => console.error('Could not remove file from storage', err));
  await audit(me(req), 'document.deleted', { productionId: doc.productionId, detail: { title: doc.title } });
  res.status(204).end();
}));
