import type { ElfComChannel } from "@elfcom/contract";

export type ChannelLink = {
  ownerTrustId: string;
  channel: ElfComChannel;
  handleBlindIndex: string;
  /** Optional sealed handle for outbound (user-key ciphertext JSON). */
  handleCipherJson?: string;
  createdAt: string;
};

export class ChannelLinkStore {
  private readonly byBlind = new Map<string, ChannelLink>();

  private key(channel: string, blind: string) {
    return `${channel}:${blind}`;
  }

  upsert(link: ChannelLink) {
    this.byBlind.set(this.key(link.channel, link.handleBlindIndex), link);
  }

  resolve(channel: string, handleBlindIndex: string): ChannelLink | null {
    return this.byBlind.get(this.key(channel, handleBlindIndex)) ?? null;
  }

  listForOwner(ownerTrustId: string): ChannelLink[] {
    return [...this.byBlind.values()].filter((l) => l.ownerTrustId === ownerTrustId);
  }
}
