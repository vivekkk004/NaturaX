import { isDBConnected, transactionsSupported } from '../../config/db.js';

/**
 * Liveness + readiness in one call: reports 503 when the database is unreachable so a
 * load balancer / uptime monitor can tell the API is not able to serve real requests.
 */
export function getHealth(_req, res) {
  const dbConnected = isDBConnected();
  res.status(dbConnected ? 200 : 503).json({
    data: {
      status: dbConnected ? 'ok' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      transactions: transactionsSupported(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}
