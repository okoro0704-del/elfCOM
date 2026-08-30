export type {
  ProfileMode,
  ElfProfile,
  ElfAccountContext,
  ProfileSetupInput,
  DirectoryUserCard,
  DirectorySearchResult,
} from "./types.js";

export {
  ProfileManager,
  createDefaultAccountContext,
  loadProfileManager,
} from "./account/profile-manager.js";

export {
  DirectoryDiscovery,
  localDirectorySearch,
  searchDirectory,
} from "./directory/discovery.js";
export type { DiscoveryClientConfig } from "./directory/discovery.js";
