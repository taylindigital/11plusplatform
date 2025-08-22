import type { PublicClientApplication, AccountInfo } from '@azure/msal-browser';

declare global {
  interface Window {
    msalInstance?: PublicClientApplication;
    __env?: Record<string, string>;
    __lastMsalCfg?: {
      authority?: string;
      metadataUrl?: string;
      knownAuthorities?: string[];
      clientIdPresent: boolean;
      hasAuthorityMetadata: boolean;
      account?: Pick<AccountInfo, 'username' | 'homeAccountId'> | null;
    };
  }
}

export {};