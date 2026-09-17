# Use an official Node runtime as a parent image
FROM node:24

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the exact dependency versions in the lockfile
RUN npm ci

# Bundle app source
COPY . .

# Expose port and start application
EXPOSE 5000
CMD ["npm", "start"]
