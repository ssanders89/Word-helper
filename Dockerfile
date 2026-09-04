FROM node:20-slim

# ffmpeg is used to convert browser-recorded audio (webm/opus) into the raw
# PCM Whisper expects over the Wyoming protocol.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000 \
    PICTURES_DIR=/pictures

EXPOSE 3000
VOLUME ["/pictures"]

CMD ["node", "server/index.js"]
