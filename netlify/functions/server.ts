import serverless from "serverless-http";
import { createApp } from "../../server/_core/app";

// Wrap the Express app as a single Netlify Function.
// netlify.toml redirects /api/* here; Netlify preserves the original request
// path, so Express still matches its /api/trpc and /api/auth/* routes.
const app = createApp();

export const handler = serverless(app);
