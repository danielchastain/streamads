FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["npm", "run", "start"]
