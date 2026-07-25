export type NtfyUrl = {
  host: string;
  protocol: "http" | "https";
  credentials?:
    | {
      user: string;
      password: string;
    }
    | { token: string; };
  parameters?: string;
};

export const NTFY_URL_REGEX
  = /^(?<protocol>https?|ntfys?):\/\/(?:(?:(?<user>[^:@]+):)?(?<password>[^@]+)?@)?(?<host>[^/?]+)\/?(?<parameters>.*)$/;

/*
 * URL format supports the ?auth= parameter
 * example: https://ntfy.sh/?auth=mytoken
 * example: https://authtoken123@myserver.example.com/
 *
 * The same goes for apprise ntfy urls
 * example: ntfy://{token}@{host}/
 * example: ntfy://{user}:{password}@{host}/
 * https variant: ntfys://{user}:{password}@{host}/
 */
export const parseNtfyUrl = (url: string): NtfyUrl => {
  const match = url.match(NTFY_URL_REGEX);

  if (!match) {
    throw new Error(`Invalid NTFY URL: ${url}`);
  }

  const {
    protocol: protocolType,
    user,
    password,
    host,
    parameters,
  } = match.groups || {};

  // Determine protocol
  let protocol: "http" | "https";

  if (["http", "ntfy"].includes(protocolType)) {
    protocol = "http";
  }
  else if (["https", "ntfys"].includes(protocolType)) {
    protocol = "https";
  }
  else {
    throw new Error(`Invalid NTFY URL: ${url}`);
  }

  const credentials = user
    ? { user, password }
    : (password
        ? { token: password }
        : undefined);

  return {
    host,
    protocol,
    credentials,
    parameters: parameters || undefined,
  };
};
