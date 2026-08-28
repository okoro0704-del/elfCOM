export type ElfComChannel =
  | "dm"
  | "bus"
  | "whatsapp"
  | "telegram"
  | "email"
  | "instagram"
  | "x";

export type SealedBlob = {
  ciphertext: string;
  nonce: string;
  kid: string;
  aadHash: string;
};

export type SealAad = {
  ownerTrustId: string;
  threadId: string;
  messageId: string;
  channel: string;
  createdAt: string;
};

export type SealedThreadEnvelope = {
  id: string;
  updatedAt: string;
  unreadCount: number;
  participants?: string[];
  channel?: ElfComChannel;
  peerRef?: string;
  titleCipher?: SealedBlob;
  titleAad?: SealAad;
  previewCipher?: SealedBlob;
  previewAad?: SealAad;
};

export type SealedMessageEnvelope = {
  id: string;
  threadId: string;
  senderId: string;
  createdAt: string;
  channel?: ElfComChannel;
  direction?: "inbound" | "outbound";
  bodyCipher: SealedBlob;
  aad: SealAad;
};

export type OpenedThread = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  channel?: ElfComChannel;
  peerRef?: string;
  participants?: string[];
};

export type OpenedMessage = {
  id: string;
  threadId: string;
  body: string;
  senderId: string;
  createdAt: string;
  channel?: ElfComChannel;
  direction?: "inbound" | "outbound";
};

export type SessionMaterial = {
  ownerTrustId: string;
  sid: string;
  sessionKey: Uint8Array;
  zkBind: string;
};
