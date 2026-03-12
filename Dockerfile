FROM node:20-alpine

WORKDIR /app

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED 1

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Generate Prisma types
RUN npx prisma generate

# Build Next.js app
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
