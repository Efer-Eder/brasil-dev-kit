import { createServer } from 'node:http';
import { API_VERSION, createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const log = (event: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`);

const app = createApp({ config, log });

const server = createServer((req, res) => {
  app.handle(req, res).catch((error: unknown) => {
    log({ level: 'error', msg: 'falha ao responder', error: String(error) });
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = config.headersTimeoutMs;
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.maxHeadersCount = 50;

server.listen(config.port, config.host, () => {
  log({
    level: 'info',
    msg: 'api iniciada',
    versao: API_VERSION,
    host: config.host,
    port: config.port,
  });
});

// Métricas agregadas a cada 5 min (sem IPs nem caminhos, só contadores).
const statsTimer = setInterval(
  () => log({ level: 'info', msg: 'stats', ...app.stats() }),
  5 * 60_000,
);
statsTimer.unref();

function shutdown(signal: string) {
  log({ level: 'info', msg: 'encerrando', signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
