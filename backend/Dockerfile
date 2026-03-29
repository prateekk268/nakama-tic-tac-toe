ARG BUILDPLATFORM=linux/arm64
ARG TARGETPLATFORM=linux/amd64

FROM --platform=$BUILDPLATFORM node:22.22.1-alpine3.23 AS builder

WORKDIR /backend

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM --platform=$TARGETPLATFORM registry.heroiclabs.com/heroiclabs/nakama:3.22.0

COPY local.yml /nakama/data/local.yml
COPY --from=builder /backend/build/index.js /nakama/data/modules/build/index.js
COPY scripts/render-start.sh /nakama/render-start.sh

RUN chmod +x /nakama/render-start.sh
