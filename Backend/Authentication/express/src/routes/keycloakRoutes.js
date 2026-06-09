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

const router = express.Router();

router.post('/login', login);
router.post('/introspect', introspect);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.post('/userinfo', userinfo); // 2 fetches userinfo + users
router.post('/createuser', createUser);
router.put('/reset-password', resetPassword);
router.post('/create-reset-code', createResetCode);
router.post('/check-reset-code', checkResetCode);
router.put('/user/:email', updateUserAttributes);

export default router;
