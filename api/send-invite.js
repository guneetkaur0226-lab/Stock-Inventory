// POST /api/send-invite   { name, email }   Authorization: Bearer <Firebase ID token>
// Emails the app link to an invited staff member. Owner only.
import { createHandler } from './_invite.js';

export default createHandler();
