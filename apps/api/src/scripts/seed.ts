/**
 * Creates the first admin, and with --sample also loads invented demo data
 * (the same productions shown in the design). Never run --sample on a live database.
 *
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... pnpm seed [-- --sample]
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../db';
import { Character, Episode, ExpenseSheet, Milestone, Person, Production, ScriptEpisode, Story, User } from '../models';
import { createProduction, initEpisodes } from '../modules/productions.service';

const day = (offset: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters)');
  await connectDb();

  let admin = await User.findOne({ email: email.toLowerCase() });
  if (!admin) {
    admin = await User.create({ name: process.env.SEED_ADMIN_NAME ?? 'Admin', email, passwordHash: await bcrypt.hash(password, 12), role: 'admin' });
    console.log(`Created admin ${email}`);
  } else console.log(`Admin ${email} already exists`);

  if (!process.argv.includes('--sample')) return;
  if (await Production.countDocuments()) { console.log('Productions already exist; skipping sample data'); return; }
  const user = { id: String(admin._id), name: admin.name, email: admin.email, role: 'admin' as const };

  const make = async (input: Parameters<typeof createProduction>[0], stage: number) => {
    const p = await createProduction(input, user);
    p.stages.forEach((s) => { s.status = s.order < stage ? 'completed' : s.order === stage ? 'in_progress' : 'pending'; if (s.order < stage) s.completedAt = day(-200 + s.order * 20); });
    p.currentStage = stage;
    p.deliveryRequirements = ['Picture master, ProRes 422 HQ', 'Final mix and stems', 'Loudness check', 'QC report', 'Promo cut, 30 seconds', 'Episode synopsis'];
    await p.save();
    return p;
  };

  const dkr = await make({ title: 'Dil Ka Rasta', format: 'long_serial', genre: 'Family drama', writer: 'Hina Farooq', director: 'Kamran Abbasi', channel: 'Rang TV', totalEpisodes: 26, totalBudget: 85_000_000 }, 9);
  const cr = await make({ title: 'Chandni Raat', format: 'long_serial', genre: 'Romance', writer: 'Usman Ghani', director: 'Sara Malik', channel: 'Sitara Entertainment', totalEpisodes: 30, totalBudget: 38_000_000 }, 6);
  await make({ title: 'Sheher-e-Khamosh', format: 'telefilm', genre: 'Thriller', writer: 'Hina Farooq', director: 'Bilal Raza', channel: 'Rang TV', totalEpisodes: 1, totalBudget: 12_000_000 }, 11);
  const akp = await make({ title: 'Aangan Ke Paar', format: 'short_serial', genre: 'Family drama', writer: admin.name, channel: 'Sitara Entertainment', totalEpisodes: 8, totalBudget: 24_000_000 }, 3);

  await initEpisodes(String(dkr._id), 40);
  await Episode.updateMany({ productionId: dkr._id, number: { $lte: 10 } }, { recordedScenes: 40, 'board.script': 'done', 'board.shoot': 'done' });
  await Episode.updateOne({ productionId: dkr._id, number: 11 }, { recordedScenes: 12, 'board.script': 'done', 'board.shoot': 'in_progress' });
  await Episode.updateMany({ productionId: dkr._id, number: { $lte: 4 } }, { 'board.offlineEdit': 'done', 'board.onlineEdit': 'done', 'board.sound': 'done', 'board.qc': 'done', 'board.delivery': 'done' });
  await Episode.updateOne({ productionId: dkr._id, number: 5 }, { 'board.offlineEdit': 'done', 'board.onlineEdit': 'done', 'board.sound': 'done', 'board.qc': 'in_progress', airDate: day(3) });

  const items = (rows: [string, string, number][], approved: boolean) => rows.map(([category, note, requested]) => ({ category, note, requested, approved: approved ? requested : null }));
  await ExpenseSheet.create([
    { productionId: dkr._id, shootDate: day(-3), shootDay: 11, lineProducer: 'Saad Mirza', status: 'approved', items: items([['location', 'Clifton bungalow day rate', 120_000], ['crew_wages', 'Daily crew', 96_000], ['lunch_catering', '34 people', 51_000]], true), submittedAt: day(-3), decidedBy: admin.name, decidedAt: day(-2) },
    { productionId: dkr._id, shootDate: day(-1), shootDay: 13, lineProducer: 'Saad Mirza', status: 'submitted', items: items([['location', 'Clifton bungalow day rate', 120_000], ['equipment_rental', 'Extra HMI lights', 45_000]], false), submittedAt: day(-1) },
    { productionId: dkr._id, shootDate: day(0), shootDay: 14, lineProducer: 'Saad Mirza', status: 'submitted', items: items([['location', 'Clifton bungalow day rate', 120_000], ['fuel_transport', '3 vans and generator diesel', 38_500], ['crew_wages', 'Daily crew', 96_000]], false), submittedAt: day(0) },
  ]);
  await Milestone.create([
    { productionId: dkr._id, title: 'Haveli block wrap', category: 'production', dueDate: day(12), status: 'in_progress', assignee: 'Saad Mirza' },
    { productionId: dkr._id, title: 'Episodes 12 to 15 script lock', category: 'production', dueDate: day(4), assignee: 'Hina Farooq' },
    { productionId: cr._id, title: 'Episode 6 script lock', category: 'pre_production', dueDate: day(-4), assignee: 'Usman Ghani' },
  ]);
  await Person.create([
    { productionId: dkr._id, name: 'Ayesha Noor', role: 'Zoya, lead', department: 'cast', availability: 'on_set', contractStatus: 'signed' },
    { productionId: dkr._id, name: 'Saad Mirza', role: 'Line producer', department: 'production', availability: 'on_set', contractStatus: 'signed' },
    { productionId: dkr._id, name: 'Bushra Ali', role: 'Makeup artist', department: 'makeup', contractStatus: 'pending' },
  ]);

  const story = await Story.create({
    productionId: akp._id, title: 'Aangan Ke Paar', format: 'drama_serial', language: 'roman_urdu', createdBy: admin._id,
    oneLiner: 'Zara, Hyderabad ki ek school teacher, apne walid ke inteqal ke baad jaanti hai ke jis ghar mein woh pali barhi, woh barson pehle uske chacha ke naam likha ja chuka hai. Chacha Rafiq ek hi shart par ghar chhorne ko tayyar hain: Zara unke bete Bilal se shaadi kare.',
  });
  await ScriptEpisode.create([
    { storyId: story._id, number: 1, title: 'Kaghzaat darwaze par', status: 'written', content: '1. INT. ZARA KA GHAR, AANGAN - SUBAH\nPurana Hyderabadi aangan. ZARA (27) takht par bachon ki copies check kar rahi hai.\n\nMAA (O.S.)\nZara, chai thandi ho gayi hai beta.\n\n2. EXT. GALI, GHAR KA DARWAZA - SUBAH\nCHACHA RAFIQ (58) gate par khare hain. Haath mein ek purani, peeli file.' },
    { storyId: story._id, number: 2, title: 'Chacha ki shart', status: 'planned' },
  ]);
  await Character.create([
    { storyId: story._id, name: 'Zara', description: 'Lead. School teacher, eldest daughter.', ageRange: '25 to 30', familyGroup: 'Zara’s household', finalCast: 'Mahnoor Sheikh' },
    { storyId: story._id, name: 'Chacha Rafiq', description: 'Uncle who holds the house papers.', ageRange: '55 to 60', familyGroup: 'Rafiq’s household', actorOptions: [{ name: 'Javed Qamar', note: 'Available from November' }, { name: 'Naeem Haider', note: 'Theatre background' }] },
  ]);
  console.log('Loaded sample data');
}

main()
  .catch((err) => { console.error(err.message ?? err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
