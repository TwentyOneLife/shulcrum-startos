# Verifying a release

Every release ships the `.s9pk` files, a `SHA256SUMS` listing them, and `SHA256SUMS.asc`, a detached
signature over that list. Checking both means you are installing what we published rather than what
a mirror, a proxy or a compromised release page handed you.

## The key

```
Fingerprint  09F6 80BB 428D 92E4 BEDC  8251 15DC 7438 A64C 9B6D
UID          TwentyOne.Life <dev@twentyone.life>
```

The public key is in this repository at [`keys/twentyonelife-release.asc`](../keys/twentyonelife-release.asc).

Two keys are involved, and the split is deliberate. The **primary key certifies only**: it never
signs a release and never goes near CI. A **signing subkey** does the work. If a build runner is ever
compromised, that subkey can be revoked and replaced without losing the identity or asking anyone to
trust a new fingerprint.

A fingerprint published in the same repository as the software is worth exactly as much as the
repository. If you have another channel to confirm it through, use it.

## Checking a download

```sh
# alongside the .s9pk you downloaded
gpg --import keys/twentyonelife-release.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum --check --strict SHA256SUMS
```

Both commands must succeed. What you want to see:

- `Good signature from "TwentyOne.Life <dev@twentyone.life>"`, and a `Primary key fingerprint` line
  matching the fingerprint above, character for character. **Read that line.** A good signature only
  says the file was signed by whichever key you imported.
- `OK` for each `.s9pk`.

`gpg` will also say the key is not certified with a trusted signature. That is expected. It means
nobody has personally signed our key, not that anything is wrong with the signature. If you want the
warning gone, sign the key locally once you are satisfied it is ours.

## What a failure means

| Symptom | Reading |
|---|---|
| `BAD signature` | The `SHA256SUMS` file was altered after signing. Do not install. |
| `Can't check signature: No public key` | The key was not imported, or the release was signed by a different key. |
| Fingerprint does not match | The signature is good for **some** key, and not for ours. Treat exactly as `BAD`. |
| A `.s9pk` line reports `FAILED` | That file does not match what was signed. It is corrupt or substituted. |

## The other signature

The `.s9pk` also carries a signature of its own, over the package root, which StartOS and a registry
check. It uses a different key and answers a different question: the GPG signature here tells a human
that a download is authentic, and the package signature tells a machine that a package comes from the
same publisher it did last time. Losing either is a problem; confusing them is worse.

`start-cli s9pk inspect <file> commitment` prints the package's root signature hash, and the build
prints it on every run, so a change of publisher shows up in a log rather than at install time.
