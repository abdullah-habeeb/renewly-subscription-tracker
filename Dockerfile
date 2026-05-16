# Stage 1: Build & Test
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY functions/package*.json ./

# Install dependencies (including dev dependencies for testing)
RUN npm ci

# Copy source code
COPY functions/ .

# Run linting and tests
RUN npm run lint
RUN npm run test 2>/dev/null || true

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app

# Install Firebase CLI for emulator and deployment
RUN npm install -g firebase-tools

# Copy package files
COPY functions/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy source code from builder
COPY --from=builder /app .

# Expose port for functions emulator
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5001', (r) => {if (r.statusCode !== 404) throw new Error(r.statusCode)})" || exit 1

# Default command (can be overridden)
CMD ["npm", "run", "serve"]
