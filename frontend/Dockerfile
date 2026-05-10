# Build stage
FROM node:25-alpine as builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build
# Production stage
FROM node:25-alpine
WORKDIR /app
COPY --from=builder /app .
CMD ["npm","run","start"]