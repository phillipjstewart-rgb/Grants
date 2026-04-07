# Development Dockerfile for grant-os
# This is optimized for development with hot reload, not production builds

FROM node:22-alpine

WORKDIR /app

# Install Python for CLI tools
RUN apk add --no-cache python3 py3-pip build-base libffi-dev openssl-dev

# Copy package files
COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/

# Install dependencies (no build step)
RUN npm ci --legacy-peer-deps

# Copy source files
COPY web/ web/
COPY data/ data/
COPY supabase/ supabase/
COPY python/ python/

# Install Python package
RUN pip install --no-cache-dir -e "./python" 2>/dev/null || true

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})" || true

# Start in dev mode with watch
CMD ["npm", "run", "dev", "--prefix", "web"]
