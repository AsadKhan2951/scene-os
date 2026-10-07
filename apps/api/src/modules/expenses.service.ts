import { ExpenseSheet } from '../models';
import type { AuthUser } from '../middleware/auth';
import { HttpError, notFound } from '../lib/http';
import { audit } from '../lib/audit';

export const sheetTotals = (sheet: { items: { requested: number; approved?: number | null }[] }) => ({
  requested: sheet.items.reduce((sum, i) => sum + i.requested, 0),
  approved: sheet.items.reduce((sum, i) => sum + (i.approved ?? 0), 0),
});

type Decision = 'approve' | 'reject' | 'revise';

/** Approve, reject or send back a submitted sheet. Admin only; callers check the role. */
export async function decideSheet(
  sheetId: string,
  decision: Decision,
  input: { comment?: string; approved?: Record<string, number> },
  user: AuthUser,
  via: 'user' | 'dreamer' = 'user',
) {
  const sheet = await ExpenseSheet.findById(sheetId);
  if (!sheet) throw notFound('Expense sheet');
  if (sheet.status !== 'submitted') throw new HttpError(409, `This sheet is ${sheet.status}, so it cannot be reviewed`);

  if (decision === 'approve') {
    for (const item of sheet.items) {
      const amount = input.approved?.[String(item._id)];
      item.approved = amount ?? item.requested;
    }
    sheet.status = 'approved';
  } else if (decision === 'reject') {
    sheet.status = 'rejected';
  } else {
    if (!input.comment) throw new HttpError(400, 'Say what needs to change before sending the sheet back');
    sheet.status = 'draft';
  }
  const action = { approve: 'approved', reject: 'rejected', revise: 'sent back' }[decision];
  sheet.comments.push({ by: user.name, text: input.comment ?? '', action, at: new Date() });
  sheet.decidedBy = user.name;
  sheet.decidedAt = new Date();
  await sheet.save();
  await audit(user, `expense.${decision}`, { productionId: sheet.productionId, targetId: sheet._id, via, detail: sheetTotals(sheet) });
  return sheet;
}
