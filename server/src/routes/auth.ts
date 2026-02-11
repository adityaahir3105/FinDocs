import { Router } from 'express';
import { googleLogin, logout, checkAuth } from '../middleware/auth';

const router = Router();

router.post('/google', googleLogin);
router.post('/logout', logout);
router.get('/check', checkAuth);

export default router;
