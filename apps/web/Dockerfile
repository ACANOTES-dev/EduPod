FROM node:24-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN API_URL=http://localhost:5552 APP_URL=http://localhost:5551 NEXT_PUBLIC_API_URL= pnpm --filter @school/web build

FROM base AS runtime

ENV NODE_ENV=production
ENV APP_URL=http://localhost:5551
ENV API_URL=http://localhost:5552
ENV NEXT_PUBLIC_API_URL=

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/apps/web ./apps/web
COPY --from=build /app/packages ./packages

WORKDIR /app/apps/web

EXPOSE 5551

CMD ["pnpm", "start"]
