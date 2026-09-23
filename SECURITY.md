# Security

## Reporting a vulnerability

Report privately, through
[GitHub's private vulnerability reporting](https://github.com/TwentyOneLife/shulcrum-startos/security/advisories/new).
It is enabled on this repository and goes only to the maintainer.

Please do not open a public issue for anything that affects funds, keys, or what a wallet is told
about the chain.

The address in the release key's user id identifies the key. It is not a monitored mailbox, so it
is not a reporting channel.

## What this package is, in security terms

It packages an Electrum server. It holds no keys and signs no transactions. What it can get wrong
is what it tells a wallet about the chain, which is why the interesting parts are:

- **The chain guard**, which refuses to build an index until the node has served a 164-byte header.
  An index built against the wrong chain cannot be corrected, only rebuilt.
- **The node requirements guard**, which refuses a pruned node or one without a transaction index,
  because both produce a server that answers some questions wrongly rather than failing.
- **The protocol rules**, which refuse to serve a header to a client that cannot read it. A wallet
  that misreads a header computes the wrong block hash and cannot follow the chain.
- **The supply chain**: `start-cli` is checked by SHA256 and two signatures before it is trusted,
  every action is pinned by commit, the base image by digest, and releases are signed with a key
  published in this repository.

## Verifying what you install

[`docs/verifying-a-release.md`](docs/verifying-a-release.md) explains the release signature, the
key, and what each failure means.

## Supported versions

The latest release. This is a young package and there is no back-porting.
