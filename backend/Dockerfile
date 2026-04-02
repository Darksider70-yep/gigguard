FROM node:22-alpine AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

# Security: create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application from build stage
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=15s \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

CMD ["node", "dist/src/index.js"]
