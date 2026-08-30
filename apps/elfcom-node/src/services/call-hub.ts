/**
 * In-memory WebRTC call signaling hub — invites + SDP/ICE relay by TrustID.
 */
import type { WebSocket } from "ws";

export type CallType = "AUDIO" | "VIDEO";

export type CallRecord = {
  id: string;
  callerTid: string;
  calleeTid: string;
  type: CallType;
  status: "ringing" | "active" | "ended";
  createdAt: string;
};

export type CallSignalKind = "offer" | "answer" | "ice" | "hangup";

type CallSocket = {
  socket: WebSocket;
  userId: string;
};

type Outbound = Record<string, unknown>;

export class CallHub {
  private readonly calls = new Map<string, CallRecord>();
  private readonly sockets = new Map<string, Set<CallSocket>>();
  /** Buffer signals until peer is connected / ready. */
  private readonly pending = new Map<string, Outbound[]>();

  addSocket(userId: string, socket: WebSocket) {
    const entry: CallSocket = { socket, userId };
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(entry);

    const flush = this.pending.get(userId);
    if (flush?.length) {
      for (const msg of flush) this.sendRaw(socket, msg);
      this.pending.delete(userId);
    }

    const cleanup = () => {
      set!.delete(entry);
      if (set!.size === 0) this.sockets.delete(userId);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }

  createCall(callerTid: string, calleeTid: string, type: CallType): CallRecord {
    const id = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: CallRecord = {
      id,
      callerTid,
      calleeTid,
      type,
      status: "ringing",
      createdAt: new Date().toISOString(),
    };
    this.calls.set(id, record);

    this.push(calleeTid, {
      typ: "call.invite",
      callId: id,
      fromTid: callerTid,
      toTid: calleeTid,
      callType: type,
      ts: record.createdAt,
    });

    return record;
  }

  get(id: string): CallRecord | undefined {
    return this.calls.get(id);
  }

  accept(id: string, byTid: string): CallRecord | null {
    const call = this.calls.get(id);
    if (!call || call.calleeTid !== byTid) return null;
    if (call.status === "ended") return null;
    call.status = "active";
    this.push(call.callerTid, {
      typ: "call.accepted",
      callId: id,
      fromTid: byTid,
      toTid: call.callerTid,
      callType: call.type,
      ts: new Date().toISOString(),
    });
    return call;
  }

  relaySignal(
    id: string,
    fromTid: string,
    kind: CallSignalKind,
    payload: unknown,
  ): CallRecord | null {
    const call = this.calls.get(id);
    if (!call) return null;
    if (call.callerTid !== fromTid && call.calleeTid !== fromTid) return null;
    if (call.status === "ended") return null;

    const toTid = call.callerTid === fromTid ? call.calleeTid : call.callerTid;
    this.push(toTid, {
      typ: "call.signal",
      callId: id,
      fromTid,
      toTid,
      kind,
      payload,
      callType: call.type,
      ts: new Date().toISOString(),
    });
    return call;
  }

  hangup(id: string, fromTid: string): CallRecord | null {
    const call = this.calls.get(id);
    if (!call) return null;
    if (call.callerTid !== fromTid && call.calleeTid !== fromTid) return null;
    call.status = "ended";
    const toTid = call.callerTid === fromTid ? call.calleeTid : call.callerTid;
    this.push(toTid, {
      typ: "call.ended",
      callId: id,
      fromTid,
      toTid,
      callType: call.type,
      ts: new Date().toISOString(),
    });
    return call;
  }

  private push(userId: string, msg: Outbound) {
    const set = this.sockets.get(userId);
    if (!set || set.size === 0) {
      const buf = this.pending.get(userId) ?? [];
      buf.push(msg);
      // Keep last 32 pending per user
      this.pending.set(userId, buf.slice(-32));
      return;
    }
    for (const c of set) {
      if (c.socket.readyState === 1) this.sendRaw(c.socket, msg);
    }
  }

  private sendRaw(socket: WebSocket, msg: Outbound) {
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }
}

export const callHub = new CallHub();
