import { Router } from 'express';
import { z } from 'zod';
import { dreamerMessageSchema, reportSchema } from '@sceneos/shared';
import { plainText } from '@sceneos/shared';
import { DreamerChat, Report } from '../models';
import { me } from '../middleware/auth';
import { h, notFound, oid } from '../lib/http';
import { generateText } from '../lib/anthropic';
import { reportContext, resolvePending, sendMessage, view } from './dreamer.service';

export const dreamerRouter = Router();

dreamerRouter.get('/chats', h(async (req, res) => {
  res.json(await DreamerChat.find({ userId: me(req).id }).sort({ updatedAt: -1 }).limit(30).select('title updatedAt').lean());
}));

dreamerRouter.get('/chats/:id', h(async (req, res) => {
  const chat = await DreamerChat.findOne({ _id: oid(req.params.id), userId: me(req).id });
  if (!chat) throw notFound('Conversation');
  res.json(view(chat));
}));

dreamerRouter.post('/messages', h(async (req, res) => {
  const { chatId, message } = dreamerMessageSchema.parse(req.body);
  res.json(await sendMessage(chatId, message, me(req)));
}));

dreamerRouter.post('/chats/:id/confirm', h(async (req, res) => {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  res.json(await resolvePending(oid(req.params.id), accept, me(req)));
}));

dreamerRouter.get('/reports', h(async (_req, res) => {
  res.json(await Report.find().sort({ createdAt: -1 }).limit(30).lean());
}));

const PERIOD = { daily: 'today', weekly: 'this week', monthly: 'this month' };
dreamerRouter.post('/reports', h(async (req, res) => {
  const { type } = reportSchema.parse(req.body);
  const content = await generateText(
    'You are Dreamer, the reporting assistant in Scene OS. Write a production report for leadership from the data given. Use only that data; never invent figures. Plain language, short sections: Summary, Each production, Risks, Decisions needed. Amounts in PKR. Plain text only: no markdown, no # or asterisks; put each section name on its own line.',
    `Write the ${type} report covering ${PERIOD[type]}. Today is ${new Date().toDateString()}.\n\nData:\n${await reportContext()}`,
    3000,
  );
  res.status(201).json(await Report.create({ type, content: plainText(content), createdBy: me(req).name }));
}));
