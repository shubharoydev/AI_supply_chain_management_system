import express from 'express';
import { getBriefing, askAdvisor } from '../controllers/advisory.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { geminiRateLimit} from '../middleware/geminiRateLimit.middleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/briefing', geminiRateLimit, getBriefing);
router.post('/ask', geminiRateLimit, askAdvisor);

export default router;
