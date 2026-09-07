# Danish Hawk commerce — no build step, no dependencies to install.
#
# Build from the REPOSITORY ROOT, not from app/:
#     docker build -f app/Dockerfile -t danishhawk-shop .
#
# The context has to reach outside app/ because the price of a Tandhjulet is
# worked out by assets/tandhjulet-pricing.js, which the website also quotes
# from. One file, so a customer can never be shown one number and charged
# another; it lands at /assets, which is where src/pricing looks for it.
FROM node:22-alpine

WORKDIR /app
COPY app/package.json ./
COPY app/server.js ./
COPY app/src ./src
COPY app/public ./public
COPY assets/tandhjulet-pricing.js /assets/tandhjulet-pricing.js

# SQLite lives here; mount a volume so orders survive a redeploy.
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=8s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
