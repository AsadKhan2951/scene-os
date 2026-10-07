import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { label } from '@sceneos/shared';
import { Episode, ExpenseSheet, Production } from '../models';
import { h } from '../lib/http';
import { sheetTotals } from './expenses.service';

export const exportsRouter = Router();
const TYPES = ['productions', 'pipeline', 'episodes', 'budget', 'full'] as const;
type Kind = Exclude<(typeof TYPES)[number], 'full'>;

function sheet(wb: ExcelJS.Workbook, name: string, columns: string[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((header) => ({ header, width: Math.max(14, header.length + 4) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((r) => ws.addRow(r));
}

const builders: Record<Kind, (wb: ExcelJS.Workbook) => Promise<void>> = {
  async productions(wb) {
    const rows = await Production.find().sort({ createdAt: -1 }).lean();
    sheet(wb, 'Productions', ['Production', 'Format', 'Genre', 'Channel', 'Writer', 'Director', 'Episodes', 'Status', 'Current stage', 'Budget (PKR)', 'Created'],
      rows.map((p) => [p.title, label(p.format), p.genre, p.channel, p.writer, p.director, p.totalEpisodes, label(p.status), p.stages.find((s) => s.order === p.currentStage)?.name, p.totalBudget, p.createdAt]));
  },
  async pipeline(wb) {
    const rows = await Production.find().sort({ title: 1 }).lean();
    sheet(wb, 'Pipeline', ['Production', 'Order', 'Stage', 'Status', 'Started', 'Completed', 'Notes'],
      rows.flatMap((p) => p.stages.map((s) => [p.title, s.order, s.name, label(s.status), s.startedAt, s.completedAt, s.note])));
  },
  async episodes(wb) {
    const rows = await Episode.find().sort({ productionId: 1, number: 1 }).populate<{ productionId: { title: string } }>('productionId', 'title').lean();
    sheet(wb, 'Episodes', ['Production', 'Episode', 'Total scenes', 'Recorded', 'Remaining', 'Progress %', 'Shoot status', 'Notes'],
      rows.map((e) => [e.productionId?.title, e.number, e.totalScenes, e.recordedScenes, e.totalScenes - e.recordedScenes,
        e.totalScenes ? Math.round((e.recordedScenes / e.totalScenes) * 100) : 0, label(e.board?.shoot ?? 'pending'), e.notes]));
  },
  async budget(wb) {
    const rows = await ExpenseSheet.find().sort({ shootDate: -1 }).populate<{ productionId: { title: string } }>('productionId', 'title').lean();
    sheet(wb, 'Budget and expenses', ['Production', 'Shoot date', 'Shoot day', 'Line producer', 'Status', 'Requested (PKR)', 'Approved (PKR)'],
      rows.map((s) => { const t = sheetTotals(s); return [s.productionId?.title, s.shootDate, s.shootDay, s.lineProducer, label(s.status), t.requested, t.approved]; }));
  },
};

exportsRouter.get('/:type', h(async (req, res) => {
  const type = z.enum(TYPES).parse(req.params.type);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scene OS';
  for (const kind of type === 'full' ? (Object.keys(builders) as Kind[]) : [type]) await builders[kind](wb);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="scene-os-${type}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));
