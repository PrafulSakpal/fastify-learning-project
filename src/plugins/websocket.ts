import fp from 'fastify-plugin';
import fastifyWebsocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/**
 * Registers @fastify/websocket and adds one route, `GET /ws/appointments`,
 * plus a `broadcastAppointmentUpdate()` decorator any module can call to
 * push a message to every connected client. See docs/fastify/21-websockets.md.
 *
 * Kept intentionally simple for this app: an in-memory `Set` of sockets,
 * single process, no auth on the socket itself, no fan-out across multiple
 * server instances (that would need Redis pub/sub — a natural next step,
 * not needed for this project's scale).
 */
async function websocketPlugin(app: FastifyInstance) {
  await app.register(fastifyWebsocket);

  const clients = new Set<WebSocket>();

  app.decorate('broadcastAppointmentUpdate', function (payload: unknown) {
    const message = JSON.stringify(payload);
    for (const client of clients) {
      // readyState 1 === OPEN — skip sockets that are closing/closed but
      // haven't been removed from the set yet.
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  });

  app.get('/ws/appointments', { websocket: true }, (socket, request) => {
    clients.add(socket);
    request.log.info({ clients: clients.size }, 'websocket client connected');

    socket.on('message', (raw) => {
      // The only inbound message this demo understands — everything else
      // is ignored rather than crashing the connection on bad input.
      if (raw.toString() === 'ping') {
        socket.send('pong');
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      request.log.info({ clients: clients.size }, 'websocket client disconnected');
    });

    socket.on('error', (error) => {
      request.log.error(error, 'websocket connection error');
      clients.delete(socket);
    });
  });
}

export default fp(websocketPlugin, { name: 'websocket' });
