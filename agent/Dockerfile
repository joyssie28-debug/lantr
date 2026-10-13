FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs usage.mjs opportunities.mjs update-site.mjs rules.mjs interests.txt meal-settings.mjs dietary.mjs ./
CMD ["node", "server.mjs"]
