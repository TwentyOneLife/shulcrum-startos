# Verifying the build toolchain

Building the `.s9pk` needs `start-cli`, a third-party binary. Any such artifact is verified by
checksum and signature before it is trusted, and its provenance is recorded. This is that record.

## What we pin

```
start-cli 2.0.0
sha256  830c3b25833fed7cfb16b377172125e35aa75a27a356862776358bd21293023d   (x86_64-linux)

Signers, by full fingerprint:
  5456DBFF1B9DF905041FA7765259ADFC2D63C217   Start9 <security@start9.com>
  A969C8EBA8B13613D2568A85EE395832E45A6664   Matt Hill <matthill@start9.com>
```

Both signatures are required, not either. One compromised signer should not be enough to change what
we build with.

## The part that is easy to get wrong

The release ships `signatures.tar.gz`, and that archive contains **both the signatures and the
signers' public keys**. Verifying with a key taken from the same archive proves the archive is
internally consistent and nothing more: whoever replaced the binary could replace the key and the
signatures alongside it.

So the keys are fetched from **keys.openpgp.org by fingerprint**, which is a source independent of
the release, and the fingerprints are pinned in this file and in the workflow rather than read from
whatever arrived. Those keys carry verified UIDs at `start9.com`.

Neither the vendor's website nor the source repository publishes these fingerprints, so a keyserver
with address-verified UIDs is the strongest independent source available. That is worth stating
plainly: it is better than trust-on-first-use, and it is not the same as a fingerprint published by
the vendor over a channel we already trust.

## Doing it by hand

```sh
gh release download start-cli/v2.0.0 -R Start9Labs/start-os \
  -p start-cli_x86_64-linux -p signatures.tar.gz -D /tmp/sc
tar xzf /tmp/sc/signatures.tar.gz -C /tmp/sc

echo "830c3b25833fed7cfb16b377172125e35aa75a27a356862776358bd21293023d  /tmp/sc/start-cli_x86_64-linux" \
  | sha256sum --check --strict

export GNUPGHOME=$(mktemp -d); chmod 700 "$GNUPGHOME"
for fpr in 5456DBFF1B9DF905041FA7765259ADFC2D63C217 A969C8EBA8B13613D2568A85EE395832E45A6664; do
  curl -fsSL "https://keys.openpgp.org/vks/v1/by-fingerprint/$fpr" | gpg --batch --import
done
for s in start9 MattDHill; do
  gpg --verify "/tmp/sc/start-cli_x86_64-linux.$s.asc" /tmp/sc/start-cli_x86_64-linux
done
```

Every command must succeed. `gpg` will note the key is not certified by a trusted signature, which is
expected: it means nobody has personally signed Start9's key, not that the signature is bad.

## Upgrading

Change the version, the checksum and, if the signers change, the fingerprints, in
`.github/workflows/ci.yml` and here, in the same commit. Re-run the steps above by hand first. A
checksum bumped without a signature check is a checksum that records what arrived rather than what
was meant to.
