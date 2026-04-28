FROM node:23

WORKDIR /app

# Install dependencies at build time for a deterministic image
COPY package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

CMD ["node", "./Preprocessing/catalogue-service.mjs"]
