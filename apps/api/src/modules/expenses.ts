import { Router } from 'express';
import { z } from 'zod';
import { commentSchema, expenseDecisionSchema, expenseSheetSchema, EXPENSE_STATUSES } from '@sceneos/shared';
import { ExpenseSheet } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { decideSheet } from './expenses.service';

export const expensesRouter = Router();

expensesRouter.get('/', h(async (req, res) => {
  const q = z.object({ productionId: z.string().optional(), status: z.enum(EXPENSE_STATUSES).optional() }).parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.productionId) where.productionId = oid(q.productionId, 'productionId');
  if (q.status) where.status = q.status;
  const sort: Record<string, 1 | -1> = q.status === 'submitted' ? { submittedAt: 1 } : { shootDate: -1 };
  res.json(await ExpenseSheet.find(where).sort(sort).limit(500).populate('productionId', 'title').lean());
}));

expensesRouter.get('/:id', h(async (req, res) => {
  const sheet = await ExpenseSheet.findById(oid(req.params.id)).populate('productionId', 'title').lean();
  if (!sheet) throw notFound('Expense sheet');
  res.json(sheet);
}));

expensesRouter.post('/', h(async (req, res) => {
  res.status(201).json(await ExpenseSheet.create({ ...expenseSheetSchema.parse(req.body), submittedBy: me(req).id }));
}));

/** Edit a sheet. Only drafts can change; a submitted sheet is locked while it is reviewed. */
expensesRouter.put('/:id', h(async (req, res) => {
  const input = expenseSheetSchema.omit({ productionId: true }).parse(req.body);
  const sheet = await ExpenseSheet.findById(oid(req.params.id));
  if (!sheet) throw notFound('Expense sheet');
  if (sheet.status !== 'draft') throw new HttpError(409, 'Only draft sheets can be edited');
  sheet.set(input);
  await sheet.save();
  res.json(sheet);
}));

expensesRouter.post('/:id/submit', h(async (req, res) => {
  const sheet = await ExpenseSheet.findById(oid(req.params.id));
  if (!sheet) throw notFound('Expense sheet');
  if (sheet.status !== 'draft') throw new HttpError(409, 'This sheet has already been submitted');
  sheet.status = 'submitted';
  sheet.submittedAt = new Date();
  sheet.comments.push({ by: me(req).name, text: '', action: 'submitted', at: new Date() });
  await sheet.save();
  res.json(sheet);
}));

expensesRouter.post('/:id/comments', h(async (req, res) => {
  const { text } = commentSchema.parse(req.body);
  const sheet = await ExpenseSheet.findByIdAndUpdate(oid(req.params.id), { $push: { comments: { by: me(req).name, text, action: 'comment', at: new Date() } } }, { new: true });
  if (!sheet) throw notFound('Expense sheet');
  res.json(sheet);
}));

for (const decision of ['approve', 'reject', 'revise'] as const) {
  expensesRouter.post(`/:id/${decision}`, requireAdmin, h(async (req, res) => {
    res.json(await decideSheet(oid(req.params.id), decision, expenseDecisionSchema.parse(req.body ?? {}), me(req)));
  }));
}
