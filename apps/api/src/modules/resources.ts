import { Router } from 'express';
import { callSheetSchema, characterSchema, milestoneSchema, personSchema, reviewSchema, weeklyPlanSchema } from '@sceneos/shared';
import { CallSheet, Character, Milestone, Person, Review, WeeklyPlan } from '../models';
import { crud } from '../lib/crud';
import { h, notFound, oid } from '../lib/http';

/** Collections that are plain list / create / update / delete under a production or story. */
export const resourcesRouter = Router();

resourcesRouter.use('/people', crud(Person, { schema: personSchema, filters: ['productionId'], sort: { department: 1, name: 1 } }));
resourcesRouter.use('/milestones', crud(Milestone, { schema: milestoneSchema, filters: ['productionId'], sort: { dueDate: 1 } }));
resourcesRouter.use('/weekly-plans', crud(WeeklyPlan, { schema: weeklyPlanSchema, filters: ['productionId'], sort: { startDate: -1 } }));
resourcesRouter.use('/characters', crud(Character, { schema: characterSchema, filters: ['storyId'], sort: { familyGroup: 1, createdAt: 1 } }));
resourcesRouter.use('/reviews', crud(Review, { schema: reviewSchema, filters: ['productionId'], sort: { episodeNumber: 1, createdAt: -1 } }));

resourcesRouter.post('/call-sheets/:id/publish', h(async (req, res) => {
  const sheet = await CallSheet.findByIdAndUpdate(oid(req.params.id), { status: 'published' }, { new: true });
  if (!sheet) throw notFound('Call sheet');
  res.json(sheet);
}));
resourcesRouter.use('/call-sheets', crud(CallSheet, { schema: callSheetSchema, filters: ['productionId'], sort: { shootDate: -1 } }));
