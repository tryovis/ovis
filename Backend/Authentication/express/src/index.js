import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';
import keycloakRoutes from './routes/keycloakRoutes.js';

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();
const __dirname = fs.realpathSync('.');
const landingDirectory = path.join(__dirname, '/src/landing');

// Dynamically build allowed origins based on environment - NO HARDCODING
const getAllowedOrigins = () => {
	const origins = new Set();
	const host = process.env.APP_DOMAIN || 'localhost';
	const frontendPort = process.env.FRONTEND_PORT || '5173';

	// Always allow direct frontend access (for development)
	origins.add(`http://${host}:${frontendPort}`);

	// If NGINX proxy mode is enabled
	if (process.env.NGINX_PROXY_MODE === 'true') {
		if (process.env.NGINX_SSL_ENABLED === 'true') {
			// HTTPS through nginx
			const httpsPort = process.env.NGINX_HTTPS_PORT || '443';
			origins.add(`https://${host}:${httpsPort}`);
			if (httpsPort === '443') origins.add(`https://${host}`); // Standard HTTPS port
		} else {
			// HTTP through nginx
			const httpPort = process.env.NGINX_HTTP_PORT || '80';
			origins.add(`http://${host}:${httpPort}`);
			if (httpPort === '80') origins.add(`http://${host}`); // Standard HTTP port
		}
	}

	// If host is not localhost, also allow localhost for development
	if (host !== 'localhost') {
		origins.add(`http://localhost:${frontendPort}`);
		if (process.env.NGINX_PROXY_MODE === 'true') {
			const httpPort = process.env.NGINX_HTTP_PORT || '80';
			origins.add(`http://localhost:${httpPort}`);
			if (httpPort === '80') origins.add('http://localhost');
		}
	}

	console.log('Allowed CORS origins:', Array.from(origins));
	return Array.from(origins);
};

// Dynamic CORS configuration
app.use(
	cors({
		origin: (origin, callback) => {
			// Allow requests with no origin (like mobile apps or curl requests)
			if (!origin) return callback(null, true);

			const allowedOrigins = getAllowedOrigins();
			if (allowedOrigins.includes(origin)) {
				callback(null, true);
			} else {
				console.warn(`CORS blocked origin: ${origin}`);
				callback(new Error('Not allowed by CORS'));
			}
		},
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		credentials: true // If you're sending cookies or using authentication
	})
);

app.use(express.json({ limit: '50mb', extended: true })); // Makes it possible to retrieve the body in a simple way and limits the post file size to 50 mb

// Logs the request what have been done in the terminal
app.use((req, res, next) => {
	console.log(req.path, req.method);
	next();
});

app.use(express.static(landingDirectory));

app.get('/', function (req, res) {
	res.sendFile(path.join(landingDirectory, 'index.html'));
});

// defined endpoints / routes
app.use('/api/keycloak', keycloakRoutes);

// Start server
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
});
