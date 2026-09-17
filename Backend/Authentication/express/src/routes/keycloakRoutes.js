import express from 'express';
import {
	login,
	introspect,
	logout,
	refresh,
	userinfo,
	createUser
} from '../controllers/keycloak/authentificationController.js';
import {
	createResetCode,
	checkResetCode,
	resetPassword
} from '../controllers/keycloak/passwordResetController.js';
import { updateUserAttributes } from '../controllers/keycloak/userController.js';
import { requireUser, requireAdmin } from '../middleware/authorization.js';
import { createRateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/login', createRateLimit({ limit: 60, windowMs: 60000 }), login);
router.post('/introspect', introspect);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.post('/userinfo', userinfo); // 2 fetches userinfo + users
router.post('/createuser', requireUser, requireAdmin, createUser);
router.put('/reset-password', resetPassword);
router.post('/create-reset-code', createRateLimit({ limit: 10, windowMs: 60000 }), createResetCode);
router.post('/check-reset-code', checkResetCode);
router.put('/user/:email', requireUser, updateUserAttributes);

export default router;
