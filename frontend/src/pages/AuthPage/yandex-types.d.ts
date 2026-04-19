export {};

export interface YaAuthTokenData {
  access_token: string;
  token_type: string;
  expires_in: string;
  cid: string;
  extraData: Record<string, unknown>;
}

declare global {
  interface Window {
    YaAuthSuggest: {
      init(
        params: { client_id: string; response_type: string; redirect_uri: string },
        origin: string,
        options: {
          view: string;
          parentId: string;
          buttonView: string;
          buttonTheme: string;
          buttonSize: string;
          buttonBorderRadius: number;
        }
      ): Promise<{ handler: () => Promise<YaAuthTokenData> }>;
    };
    YaSendSuggestToken: (origin: string, options: Record<string, unknown>) => void;
  }
}
