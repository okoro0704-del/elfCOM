import type { ElfComChannel } from "@elfcom/contract";
import type { ConnectorRegistryOptions, IChannelConnector } from "./types.js";

export class ConnectorRegistry {
  private readonly byChannel = new Map<ElfComChannel, IChannelConnector>();

  constructor(opts: ConnectorRegistryOptions) {
    for (const c of opts.connectors) {
      this.byChannel.set(c.channel, c);
    }
  }

  get(channel: string): IChannelConnector | undefined {
    return this.byChannel.get(channel as ElfComChannel);
  }

  list(): IChannelConnector[] {
    return [...this.byChannel.values()];
  }

  enabledChannels(): ElfComChannel[] {
    return [...this.byChannel.keys()];
  }
}
