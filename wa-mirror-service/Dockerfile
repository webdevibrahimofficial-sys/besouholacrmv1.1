# Debian-based (not alpine) to avoid musl-related native module issues with
# Baileys' transitive dependencies.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]
