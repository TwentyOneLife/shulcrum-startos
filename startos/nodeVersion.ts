/**
 * Which node versions satisfy the dependency, in its own module so a test can check it without
 * loading the SDK's runtime.
 *
 * Flavored, because the BLAKE2b node is. ExVer treats versions of different flavors as
 * incomparable, so every bound of an unflavored range fails against `#knots:29.4.2:3`, and the
 * node's package declares no unflavored version it `satisfies` that could bridge the two. This
 * range used to be the unflavored one mirrored from electrs-pruned-startos, and StartOS showed
 * "Incorrect version" against a correctly configured node.
 *
 * The floor is the one DATUM Gateway and Mempool Guide declare against the same node, chosen so the
 * three agree. Shulcrum alone would run on older builds, since it uses the RPC and opens no P2P
 * connection, but no user is served by a node the other two refuse. The unflavored official
 * package is no longer accepted, which is correct rather than a loss, since it follows another chain
 * and the chain guard in main.ts would refuse it at start anyway.
 */
export const nodeVersionRange = '>=#knots:29.4.1:7'
