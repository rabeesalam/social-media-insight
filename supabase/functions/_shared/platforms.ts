// Per-platform token-exchange + account-lookup config for the oauth-exchange Edge Function.
// Sourced from docs/platform-capability-matrix.md (verify dates noted per platform below) — do
// not hand-wave endpoints here; if a platform's docs change, update the matrix first, then this.

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number; // seconds
}

export interface AccountInfo {
  platform_account_id: string;
  username: string | null;
  display_name: string | null;
}

export interface PlatformExchangeConfig {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string; // empty string value is valid for public/PKCE-only clients (e.g. YouTube)
  usesPkce: boolean;
  authStyle: "body" | "basic_auth_header"; // how client_id/secret are sent to the token endpoint
  fetchAccount: (accessToken: string) => Promise<AccountInfo>;
  /**
   * Meta's platforms (Threads/Instagram/Facebook) don't hand out a `refresh_token` at all — the
   * initial code exchange returns a short-lived (~1h) access token that must immediately be
   * swapped for a long-lived one (~60d), and *that* long-lived token is later refreshed by
   * re-presenting itself (not a separate refresh_token). This hook does that immediate swap right
   * after exchangeCodeForToken(); platforms without it (TikTok/YouTube/X) skip it and rely on a
   * real refresh_token instead. See docs/platform-capability-matrix.md.
   */
  exchangeForLongLivedToken?: (shortLivedToken: string) => Promise<TokenResponse>;
  /** Standard refresh_token-grant refresh, for platforms that actually issue one. */
  refreshWithRefreshToken?: (refreshToken: string) => Promise<TokenResponse>;
  /** Self-refresh: re-presents the current (long-lived) access token to get a renewed one. Only
   * set for platforms using the Meta long-lived-token pattern instead of refresh_token. */
  refreshBySelfToken?: (currentAccessToken: string) => Promise<TokenResponse>;
}

async function jsonOrThrow(res: Response, context: string) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${context} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

export const PLATFORM_CONFIGS: Record<string, PlatformExchangeConfig> = {
  tiktok: {
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    usesPkce: true,
    authStyle: "body",
    fetchAccount: async (accessToken) => {
      const res = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await jsonOrThrow(res, "TikTok user/info");
      const user = data.data?.user ?? {};
      return { platform_account_id: user.open_id, username: user.username ?? null, display_name: user.display_name ?? null };
    },
    refreshWithRefreshToken: async (refreshToken) => {
      const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
      const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
      const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken }),
      });
      const data = await jsonOrThrow(res, "TikTok token refresh");
      return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
    },
  },
  youtube: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "YOUTUBE_CLIENT_ID",
    clientSecretEnv: "YOUTUBE_CLIENT_SECRET", // may be empty — Android/installed-app OAuth clients are often public (no secret)
    usesPkce: true,
    authStyle: "body",
    fetchAccount: async (accessToken) => {
      const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await jsonOrThrow(res, "YouTube channels.list");
      const channel = data.items?.[0];
      if (!channel) throw new Error("No YouTube channel found for this account");
      return { platform_account_id: channel.id, username: null, display_name: channel.snippet?.title ?? null };
    },
    refreshWithRefreshToken: async (refreshToken) => {
      const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") ?? "";
      const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET") ?? "";
      const body = new URLSearchParams({ client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken });
      if (clientSecret) body.set("client_secret", clientSecret);
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await jsonOrThrow(res, "YouTube token refresh");
      // Google does not re-issue refresh_token on refresh — the original one keeps working.
      return { access_token: data.access_token, refresh_token, expires_in: data.expires_in };
    },
  },
  threads: {
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    clientIdEnv: "THREADS_CLIENT_ID",
    clientSecretEnv: "THREADS_CLIENT_SECRET",
    usesPkce: false,
    authStyle: "body",
    fetchAccount: async (accessToken) => {
      const res = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${accessToken}`);
      const data = await jsonOrThrow(res, "Threads me");
      return { platform_account_id: data.id, username: data.username ?? null, display_name: null };
    },
    exchangeForLongLivedToken: async (shortLivedToken) => {
      const clientSecret = Deno.env.get("THREADS_CLIENT_SECRET") ?? "";
      const params = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: clientSecret, access_token: shortLivedToken });
      const res = await fetch(`https://graph.threads.net/access_token?${params}`);
      const data = await jsonOrThrow(res, "Threads long-lived exchange");
      return { access_token: data.access_token, expires_in: data.expires_in };
    },
    refreshBySelfToken: async (currentAccessToken) => {
      const params = new URLSearchParams({ grant_type: "th_refresh_token", access_token: currentAccessToken });
      const res = await fetch(`https://graph.threads.net/refresh_access_token?${params}`);
      const data = await jsonOrThrow(res, "Threads token refresh");
      return { access_token: data.access_token, expires_in: data.expires_in };
    },
  },
  instagram: {
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    usesPkce: false,
    authStyle: "body",
    fetchAccount: async (accessToken) => {
      const res = await fetch(`https://graph.instagram.com/me?fields=user_id,username&access_token=${accessToken}`);
      const data = await jsonOrThrow(res, "Instagram me");
      return { platform_account_id: data.user_id ?? data.id, username: data.username ?? null, display_name: null };
    },
    exchangeForLongLivedToken: async (shortLivedToken) => {
      const clientSecret = Deno.env.get("INSTAGRAM_CLIENT_SECRET") ?? "";
      const params = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: clientSecret, access_token: shortLivedToken });
      const res = await fetch(`https://graph.instagram.com/access_token?${params}`);
      const data = await jsonOrThrow(res, "Instagram long-lived exchange");
      return { access_token: data.access_token, expires_in: data.expires_in };
    },
    refreshBySelfToken: async (currentAccessToken) => {
      const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: currentAccessToken });
      const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params}`);
      const data = await jsonOrThrow(res, "Instagram token refresh");
      return { access_token: data.access_token, expires_in: data.expires_in };
    },
  },
  facebook: {
    tokenUrl: "https://graph.facebook.com/v23.0/oauth/access_token",
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    usesPkce: false,
    authStyle: "body",
    fetchAccount: async (accessToken) => {
      // Facebook Pages: the user token itself isn't "the account" — list Pages the user manages.
      // First Page found is used; multi-Page selection is a future dashboard feature, not built yet.
      const res = await fetch(`https://graph.facebook.com/v23.0/me/accounts?access_token=${accessToken}`);
      const data = await jsonOrThrow(res, "Facebook me/accounts");
      const page = data.data?.[0];
      if (!page) throw new Error("No Facebook Page found for this account — see docs/platform-capability-matrix.md (professional-mode profiles have no official Insights API).");
      return { platform_account_id: page.id, username: null, display_name: page.name ?? null };
    },
    exchangeForLongLivedToken: async (shortLivedToken) => {
      const clientId = Deno.env.get("FACEBOOK_CLIENT_ID") ?? "";
      const clientSecret = Deno.env.get("FACEBOOK_CLIENT_SECRET") ?? "";
      const params = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: clientId, client_secret: clientSecret, fb_exchange_token: shortLivedToken });
      const res = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${params}`);
      const data = await jsonOrThrow(res, "Facebook long-lived exchange");
      return { access_token: data.access_token, expires_in: data.expires_in };
    },
    // No refreshBySelfToken: Page access tokens derived from a long-lived user token are
    // themselves effectively long-lived (Meta does not document a clean standalone refresh for
    // them). Re-deriving from a refreshed long-lived user token would be the real fix if this
    // becomes a problem in practice — not implemented since Facebook support is still gated on
    // resolving the Page-vs-profile question anyway (docs/platform-capability-matrix.md).
  },
  x: {
    tokenUrl: "https://api.x.com/2/oauth2/token",
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    usesPkce: true,
    authStyle: "basic_auth_header",
    fetchAccount: async (accessToken) => {
      const res = await fetch("https://api.x.com/2/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await jsonOrThrow(res, "X users/me");
      return { platform_account_id: data.data?.id, username: data.data?.username ?? null, display_name: data.data?.name ?? null };
    },
    refreshWithRefreshToken: async (refreshToken) => {
      const clientId = Deno.env.get("X_CLIENT_ID") ?? "";
      const clientSecret = Deno.env.get("X_CLIENT_SECRET") ?? "";
      const res = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
      });
      const data = await jsonOrThrow(res, "X token refresh");
      // X rotates refresh tokens — the new one MUST be persisted or the next refresh will fail.
      return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
    },
  },
};

export async function exchangeCodeForToken(
  platform: string,
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  const clientId = Deno.env.get(config.clientIdEnv) ?? "";
  const clientSecret = Deno.env.get(config.clientSecretEnv) ?? "";
  if (!clientId) throw new Error(`${config.clientIdEnv} secret is not set`);

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (config.usesPkce) body.set("code_verifier", codeVerifier);

  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

  if (config.authStyle === "basic_auth_header") {
    if (!clientSecret) throw new Error(`${config.clientSecretEnv} secret is not set (required for X's confidential client auth)`);
    headers.Authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    body.set("client_id", clientId);
  } else {
    body.set("client_id", clientId);
    if (clientSecret) body.set("client_secret", clientSecret);
  }

  const res = await fetch(config.tokenUrl, { method: "POST", headers, body });
  const data = await jsonOrThrow(res, `${platform} token exchange`);

  if (!data.access_token) throw new Error(`${platform} token exchange returned no access_token: ${JSON.stringify(data)}`);

  const initial: TokenResponse = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };

  // Meta platforms: the code exchange only ever returns a short-lived (~1h) token — swap it for
  // a long-lived one immediately so the connection doesn't need reauthorization within the hour.
  if (config.exchangeForLongLivedToken) {
    return await config.exchangeForLongLivedToken(initial.access_token);
  }
  return initial;
}

export async function fetchAccountInfo(platform: string, accessToken: string): Promise<AccountInfo> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);
  return config.fetchAccount(accessToken);
}

/**
 * Refreshes a connection's token, dispatching to whichever mechanism the platform actually uses
 * (refresh_token grant, or Meta's self-refresh-by-presenting-the-current-token pattern). Throws
 * if the platform supports neither (shouldn't happen for any of the 6 configured here, but a
 * misconfigured connection should fail loudly rather than silently returning a stale token).
 */
export async function refreshAccessToken(
  platform: string,
  currentAccessToken: string,
  refreshToken: string | null
): Promise<TokenResponse> {
  const config = PLATFORM_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  if (config.refreshWithRefreshToken) {
    if (!refreshToken) throw new Error(`${platform} connection has no refresh_token stored`);
    return await config.refreshWithRefreshToken(refreshToken);
  }
  if (config.refreshBySelfToken) {
    return await config.refreshBySelfToken(currentAccessToken);
  }
  throw new Error(`${platform} adapter has no refresh mechanism configured`);
}
