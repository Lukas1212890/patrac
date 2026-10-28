import { env } from 'cloudflare:workers';
import { authConfig } from './lib/creator-server';
import { json, errorResponse } from './lib/patrac-server';

export async function GET() { try { return json({ ...authConfig(), registrationReady: env.PATRAC_REGISTRATION_READY === 'true' }); } catch (e) { return errorResponse(e); } }
