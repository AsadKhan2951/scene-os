# Builds the API and the worker (same image, different command).
FROM node:22-alpine
RUN corepack enable
# ffmpeg cuts teasers together; the font draws the closing title.
RUN apk add --no-cache ffmpeg font-noto && mkdir -p /data/media && chown -R node:node /data
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile --filter @sceneos/api...
RUN pnpm --filter @sceneos/api build
ENV NODE_ENV=production
WORKDIR /repo/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
