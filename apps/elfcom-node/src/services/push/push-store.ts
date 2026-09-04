/**
 * Device token + notification job persistence.
 * Uses Prisma when DATABASE_URL is set; otherwise an in-memory registry
 * so local/dev can exercise the notify pipeline without Postgres.
 */
import { randomUUID } from "node:crypto";
import { persistenceEnabled, getPrisma } from "../../persistence/postgres.js";

export type Platform = "ANDROID" | "IOS" | "WEB";
export type PriorityLevel = "NORMAL" | "HIGH" | "MAX";
export type NotificationStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type DeliveryStatus = "QUEUED" | "SUCCESS" | "FAILED";

export type DeviceTokenRecord = {
  id: string;
  trustId: string;
  appId: string;
  platform: Platform;
  pushToken: string;
  deviceId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NotificationJobRecord = {
  id: string;
  tenantId: string | null;
  appId: string;
  targetTrustId: string;
  title: string | null;
  body: string | null;
  priority: PriorityLevel;
  channelId: string;
  dataPayload: Record<string, unknown> | null;
  status: NotificationStatus;
  createdAt: Date;
};

export type NotificationDeliveryRecord = {
  id: string;
  jobId: string;
  pushToken: string;
  platform: Platform;
  status: DeliveryStatus;
  failureReason: string | null;
  deliveredAt: Date | null;
};

type FullPrisma = {
  devicePushToken: {
    upsert: (args: unknown) => Promise<DeviceTokenRecord>;
    update: (args: unknown) => Promise<DeviceTokenRecord>;
    findMany: (args: unknown) => Promise<DeviceTokenRecord[]>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  notificationJob: {
    create: (args: unknown) => Promise<NotificationJobRecord>;
    update: (args: unknown) => Promise<NotificationJobRecord>;
  };
  notificationDelivery: {
    create: (args: unknown) => Promise<NotificationDeliveryRecord>;
  };
};

const memTokens = new Map<string, DeviceTokenRecord>();
const memJobs = new Map<string, NotificationJobRecord>();
const memDeliveries: NotificationDeliveryRecord[] = [];

async function db(): Promise<FullPrisma | null> {
  if (!persistenceEnabled()) return null;
  const client = await getPrisma();
  return client as unknown as FullPrisma | null;
}

export async function upsertDeviceToken(input: {
  trustId: string;
  appId: string;
  platform: Platform;
  pushToken: string;
  deviceId: string;
}): Promise<DeviceTokenRecord> {
  const prisma = await db();
  if (prisma) {
    return prisma.devicePushToken.upsert({
      where: { pushToken: input.pushToken },
      update: {
        trustId: input.trustId,
        appId: input.appId,
        platform: input.platform,
        deviceId: input.deviceId,
        isActive: true,
      },
      create: {
        trustId: input.trustId,
        appId: input.appId,
        platform: input.platform,
        pushToken: input.pushToken,
        deviceId: input.deviceId,
        isActive: true,
      },
    });
  }

  const existing = memTokens.get(input.pushToken);
  const now = new Date();
  const row: DeviceTokenRecord = {
    id: existing?.id ?? randomUUID(),
    trustId: input.trustId,
    appId: input.appId,
    platform: input.platform,
    pushToken: input.pushToken,
    deviceId: input.deviceId,
    isActive: true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  memTokens.set(input.pushToken, row);
  return row;
}

export async function deactivateDeviceToken(pushToken: string): Promise<boolean> {
  const prisma = await db();
  if (prisma) {
    try {
      await prisma.devicePushToken.update({
        where: { pushToken },
        data: { isActive: false },
      });
      return true;
    } catch {
      return false;
    }
  }
  const row = memTokens.get(pushToken);
  if (!row) return false;
  row.isActive = false;
  row.updatedAt = new Date();
  return true;
}

export async function listActiveTokens(input: {
  trustId: string;
  appId?: string;
}): Promise<DeviceTokenRecord[]> {
  const prisma = await db();
  if (prisma) {
    return prisma.devicePushToken.findMany({
      where: {
        trustId: input.trustId,
        isActive: true,
        ...(input.appId ? { appId: input.appId } : {}),
      },
    });
  }
  return [...memTokens.values()].filter(
    (t) =>
      t.trustId === input.trustId &&
      t.isActive &&
      (!input.appId || t.appId === input.appId),
  );
}

export async function createNotificationJob(input: {
  tenantId?: string | null;
  appId: string;
  targetTrustId: string;
  title?: string | null;
  body?: string | null;
  priority: PriorityLevel;
  channelId: string;
  dataPayload?: Record<string, unknown> | null;
  status?: NotificationStatus;
}): Promise<NotificationJobRecord> {
  const prisma = await db();
  if (prisma) {
    return prisma.notificationJob.create({
      data: {
        tenantId: input.tenantId ?? null,
        appId: input.appId,
        targetTrustId: input.targetTrustId,
        title: input.title ?? null,
        body: input.body ?? null,
        priority: input.priority,
        channelId: input.channelId,
        dataPayload: input.dataPayload ?? undefined,
        status: input.status ?? "PENDING",
      },
    });
  }

  const row: NotificationJobRecord = {
    id: randomUUID(),
    tenantId: input.tenantId ?? null,
    appId: input.appId,
    targetTrustId: input.targetTrustId,
    title: input.title ?? null,
    body: input.body ?? null,
    priority: input.priority,
    channelId: input.channelId,
    dataPayload: input.dataPayload ?? null,
    status: input.status ?? "PENDING",
    createdAt: new Date(),
  };
  memJobs.set(row.id, row);
  return row;
}

export async function updateNotificationJobStatus(
  id: string,
  status: NotificationStatus,
): Promise<void> {
  const prisma = await db();
  if (prisma) {
    await prisma.notificationJob.update({ where: { id }, data: { status } });
    return;
  }
  const row = memJobs.get(id);
  if (row) row.status = status;
}

export async function createNotificationDelivery(input: {
  jobId: string;
  pushToken: string;
  platform: Platform;
  status: DeliveryStatus;
  failureReason?: string | null;
  deliveredAt?: Date | null;
}): Promise<NotificationDeliveryRecord> {
  const prisma = await db();
  if (prisma) {
    return prisma.notificationDelivery.create({
      data: {
        jobId: input.jobId,
        pushToken: input.pushToken,
        platform: input.platform,
        status: input.status,
        failureReason: input.failureReason ?? null,
        deliveredAt: input.deliveredAt ?? null,
      },
    });
  }

  const row: NotificationDeliveryRecord = {
    id: randomUUID(),
    jobId: input.jobId,
    pushToken: input.pushToken,
    platform: input.platform,
    status: input.status,
    failureReason: input.failureReason ?? null,
    deliveredAt: input.deliveredAt ?? null,
  };
  memDeliveries.push(row);
  return row;
}

/** Test helpers */
export function __resetPushStore() {
  memTokens.clear();
  memJobs.clear();
  memDeliveries.length = 0;
}

export function __memSnapshot() {
  return {
    tokens: [...memTokens.values()],
    jobs: [...memJobs.values()],
    deliveries: [...memDeliveries],
  };
}
