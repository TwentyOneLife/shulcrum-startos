# Verifying a release

Every release carries a `SHA256SUMS` listing the artifacts, and a detached signature
`SHA256SUMS.asc` made with the TwentyOne.Life release signing key. Checking both tells you the file
you downloaded is the file we built.

```
Fingerprint  09F6 80BB 428D 92E4 BEDC  8251 15DC 7438 A64C 9B6D
UID          TwentyOne.Life <dev@twentyone.life>
```

Compare that fingerprint against this file in the repository, over a connection you trust. A
signature only tells you the same key signed the file both times; the fingerprint is what ties it to
us.

## Check it

```sh
gpg --import keys/TwentyOneLife-release-signing.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum --check SHA256SUMS
```

The first command must report a good signature from the fingerprint above. The second must report
`OK` for the file you downloaded. If either fails, do not install the package.

`gpg` will also say the key is not certified by a trusted signature. That is expected and is not a
failure: it means you have not personally signed our key, not that the signature is bad. The line
that matters is `Good signature`.

## What signs what

The key has a certify-only primary and a separate signing subkey, and **only the subkey is used to
sign releases**. Its secret is the only part held by CI. If it is ever compromised we revoke and
replace the subkey, and the fingerprint above does not change, so nothing you have verified before
stops being verifiable and you do not have to learn a new key.

The subkey expires 2028-09-04 and the primary 2031-09-04. An expired key still verifies signatures
made while it was valid.

## If something does not match

Open an issue, and do not install the artifact. A checksum mismatch on its own is usually a truncated
download; a signature failure on an intact file is not, and we would want to know immediately.
