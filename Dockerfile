# Zonar: Next.js app + game server + zingo-cli light wallet, in one image.
#
#   docker compose up --build
#
# Wallets (seeds!) live in the /app/.wallets volume and match state in /app/.data.
# Back them up; losing .wallets loses the house funds and any unswept vaults.

# ---------- zingo-cli + nym-proxy (Rust) ----------
FROM rust:1-bookworm AS zingo
ARG ZINGOLIB_REPO=https://github.com/zingolabs/zingolib
# The exact commit the game's zingo-cli output parsing was written and tested against.
ARG ZINGOLIB_COMMIT=3fb32d277ef956e75da124c1442526fb4d91d97a
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libsqlite3-dev pkg-config protobuf-compiler \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git init zingolib && cd zingolib \
  && git remote add origin "$ZINGOLIB_REPO" \
  && git fetch --depth 1 origin "$ZINGOLIB_COMMIT" \
  && git checkout FETCH_HEAD
WORKDIR /src/zingolib
# rust-toolchain.toml pins the compiler; rustup installs it on first use.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/zingolib/target \
    cargo build --release -p zingo-cli \
 && cargo build --release -p zingo-netutils --features nym --bin nym-proxy \
 && mkdir -p /out && cp target/release/zingo-cli target/release/nym-proxy /out/

# ---------- zonar-builder (Rust): view-only wallets for player agents ----------
FROM rust:1-bookworm AS agents
WORKDIR /src
COPY builder ./builder
WORKDIR /src/builder
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/builder/target \
    cargo build --release -p zonar-builder \
 && mkdir -p /out && cp target/release/zonar-builder /out/

# ---------- Next.js build ----------
FROM node:24-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libsqlite3-0 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=web /app/.next ./.next
COPY --from=web /app/public ./public
COPY next.config.ts tsconfig.json ./
COPY server ./server
COPY lib ./lib
# zingo-cli looks for nym-proxy beside itself.
COPY --from=zingo /out/zingo-cli /out/nym-proxy /usr/local/bin/
COPY --from=agents /out/zonar-builder /usr/local/bin/
RUN mkdir -p .wallets .data && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    ZINGO_CLI=/usr/local/bin/zingo-cli \
    BUILDER_BIN=/usr/local/bin/zonar-builder
VOLUME ["/app/.wallets", "/app/.data"]
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
