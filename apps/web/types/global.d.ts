export {};

declare global {
  interface Window {
    __lastMsalCfg?: {
      clientId: string;
      authority: string;
      knownAuthorities: string[];
      metadataUrl: string;
      hasAuthorityMetadata: boolean;
    };
  }
}