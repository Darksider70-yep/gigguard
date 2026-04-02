FROM node:22-alpine AS build

WORKDIR /app

# Build arguments
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_xxxx

# Set build environment variables
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=${NEXT_PUBLIC_RAZORPAY_KEY_ID}
ENV NEXT_DIST_DIR=.next-build
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the application
RUN npm run build

# Runtime stage
FROM node:22-alpine AS runtime

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_DIST_DIR=.next-build
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
COPY --from=build --chown=nodejs:nodejs /app/public ./public
COPY --from=build --chown=nodejs:nodejs /app/.next-build/standalone ./
COPY --from=build --chown=nodejs:nodejs /app/.next-build/static ./.next-build/static

# Switch to non-root user
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 --start-period=30s \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode >= 500) throw new Error(r.statusCode)})" || exit 1

CMD ["node", "server.js"]

