/**
 * Pick the transport once both capability lists are known: the first entry
 * in the host's preference list that the client also supports. Both peers
 * compute the same result independently — no confirmation round trip.
 * Unknown identifiers are skipped, not fatal.
 */
export const selectTransportId = (
  isHost: boolean,
  ownTransports: string[],
  peerTransports: string[],
): string | undefined => {
  const hostPreference = isHost ? ownTransports : peerTransports;
  const clientSupported = new Set(isHost ? peerTransports : ownTransports);

  return hostPreference.find(transportId => clientSupported.has(transportId));
};
