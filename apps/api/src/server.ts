import { env } from './config/env';
import { createApp } from './app';
import { connectDb } from './db';

async function main() {
  await connectDb();
  const server = createApp().listen(env.PORT, () => console.log(`Scene OS API listening on :${env.PORT}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('API failed to start', err);
  process.exit(1);
});
