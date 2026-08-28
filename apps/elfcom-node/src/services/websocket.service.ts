/**
 * In-memory WebSocket event hub for ElfCom realtime bus.
 * Clients subscribe with a capability JWT; events fan out by userId / tenantId.
 */
import type { ElfComRealtimeEvent } from "@elfcom/contract";
import type { WebSocket } from "ws";

type Client = {
  socket: WebSocket;
  userId: string;
  tenantId?: string;
};

export class WebSocketService {
  private readonly clients = new Set<Client>();

  addClient(client: Client) {
    this.clients.add(client);
    client.socket.on("close", () => this.clients.delete(client));
    client.socket.on("error", () => this.clients.delete(client));
  }

  emit(event: ElfComRealtimeEvent) {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.userId !== event.userId) continue;
      if (event.tenantId && client.tenantId && client.tenantId !== event.tenantId) continue;
      if (client.socket.readyState === 1 /* OPEN */) {
        client.socket.send(payload);
      }
    }
  }

  /** Test helper */
  clientCount() {
    return this.clients.size;
  }

  /** Test helper — inject a fake client */
  __addTestClient(client: Client) {
    this.clients.add(client);
  }

  __clear() {
    this.clients.clear();
  }
}

export const webSocketService = new WebSocketService();
