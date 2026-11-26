import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { GmailOAuthCallback } from "../domain/mailer";
import {
  disconnectGmail,
  exchangeGmailOAuthCode,
  getGmailAuthAccount,
  startGmailOAuth,
} from "../services/mailerApi";
import { googleClientId, googleClientSecret } from "../config";

export const gmailAuthQueryKey = ["gmail-auth-account"] as const;
const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
const callbackEventName = "gmail-oauth-callback";
const clientIdErrorCodes = new Set(["invalid_client", "unauthorized_client", "deleted_client"]);
const clientIdHelp =
  "Google rejected the OAuth client ID. Check the Desktop app client ID in .env.local, restart Timeless, and try again.";

function googleOAuthErrorMessage(error: string) {
  return clientIdErrorCodes.has(error)
    ? clientIdHelp
    : `Google sign-in failed: ${error}`;
}

function randomVerifier() {
  return randomBytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function randomBytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return randomBytesToBase64Url(new Uint8Array(digest));
}

export function useGmailAuth() {
  const queryClient = useQueryClient();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const accountQuery = useQuery({
    queryKey: gmailAuthQueryKey,
    queryFn: getGmailAuthAccount,
    enabled: isTauri(),
    retry: false,
  });

  const signIn = async () => {
    setSignInError(null);

    setSigningIn(true);
    let unlisten: (() => void) | undefined;
    let timeoutHandle: number | undefined;
    try {
      const state = randomVerifier();
      const verifier = randomVerifier();
      const challenge = await createCodeChallenge(verifier);
      let resolveCallback: ((callback: GmailOAuthCallback) => void) | undefined;
      const callbackPromise = new Promise<GmailOAuthCallback>((resolve) => {
        resolveCallback = resolve;
      });
      unlisten = await listen<GmailOAuthCallback>(callbackEventName, (event) => {
        resolveCallback?.(event.payload);
      });
      const callbackTimeout = new Promise<never>((_, reject) => {
        timeoutHandle = window.setTimeout(
          () =>
            reject(
              new Error(
                "Gmail sign-in timed out. If Google reported a client configuration error, check the Desktop app client ID in .env.local, restart Timeless, and try again.",
              ),
            ),
          300_000,
        );
      });
      const port = await startGmailOAuth(state);
      const redirectUri = `http://127.0.0.1:${port}`;
      const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizationUrl.search = new URLSearchParams({
        client_id: googleClientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: gmailScope,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      }).toString();
      await openUrl(authorizationUrl);

      const callback = await Promise.race([callbackPromise, callbackTimeout]);
      if (callback.state !== state) throw new Error("Gmail sign-in state did not match.");
      if (callback.error) throw new Error(googleOAuthErrorMessage(callback.error));
      if (!callback.code) throw new Error("Google did not return an authorization code.");

      const account = await exchangeGmailOAuthCode({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        code: callback.code,
        verifier,
        redirectUri,
      });
      queryClient.setQueryData(gmailAuthQueryKey, account);
      return true;
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      unlisten?.();
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await disconnectGmail();
    queryClient.setQueryData(gmailAuthQueryKey, null);
  };

  return {
    account: accountQuery.data,
    isLoading: accountQuery.isLoading,
    loadError: accountQuery.error,
    signInError,
    signingIn,
    signIn,
    signOut,
  };
}
