# Use an official Node runtime as a parent image
FROM node:latest

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies, including react-scripts
RUN npm install

# Bundle app source
COPY . .

# Expose port and start application
EXPOSE 5000
CMD ["npm", "start"]