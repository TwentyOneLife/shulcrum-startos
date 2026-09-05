# Contributing

Thanks for looking. This repository packages Shulcrum, an Electrum server for the Bitcoin Blake2b
chain, as a StartOS `.s9pk`. Issues and pull requests are welcome.

Everything here is GPLv3, and contributions are accepted under that licence.

## Building it

The package builds in a container, so you need Docker, Node, and `start-cli`. Nothing has to be
installed on the host beyond those.

```sh
npm ci
make x86
```

`make` compiles Shulcrum from source inside the package's own Dockerfile, converts the image to
squashfs and signs the result, so a first build takes a few minutes.

**Read [`docs/ci.md`](docs/ci.md) before you spend time on a build that will not start.** It lists
the environment traps that are easy to hit and hard to diagnose: where `start-cli` looks for its
workspace, which files it needs there, the buildx driver a hosted runner needs, and the squashfs
tools it calls that its own dependency check does not look for. Each of those cost a red CI run to
find.

Typechecking needs none of that:

```sh
npx tsc --noEmit
```

## What CI checks

Three jobs run on every pull request, and all three must pass:

| Job | Checks |
|---|---|
| `validate` | The repository still has its README, licence, contributing guide and ADR index |
| `no-internal-refs` | No tracked file carries a private network address, a local filesystem path or an onion address |
| `build-s9pk` | `start-cli` matches its pinned checksum and signatures, and the package builds and signs |

## What a good change looks like

- **Say why, not what.** Comments should explain the reason for a decision, especially where the
  obvious approach is wrong. Most of the comments in `startos/` exist because something surprising
  is true, and they name it.
- **Keep the diff small and in the surrounding style.** No speculative abstraction and no unrelated
  reformatting.
- **Pin and verify dependencies.** Third party binaries are pinned by version and verified by
  checksum and signature before use, with the provenance recorded. See
  [`TOOLCHAIN.md`](TOOLCHAIN.md) for how that is done for `start-cli`.
- **No telemetry and no phone-home.** The package makes no network request the operator did not ask
  for.
- **Fix a bug, add a test.** Where the logic is a shell probe, exercise it against a stand-in that
  reproduces the fault, not only against a working node. `sandbox` style harnesses that render the
  probe out of the source, rather than transcribing it, are the pattern to follow.

## Consensus sensitive areas

Some parts of this package are not ordinary application code, and a mistake in them is expensive
rather than annoying. Take extra care, and include the evidence in the pull request:

- **`extended_headers` is irreversible for a given index.** It fixes the on disk header record size,
  and the store refuses to reopen under a different one. An index built against the wrong chain is
  not a misconfiguration to correct afterwards, it is a full re-index.
- **The chain guard in `startos/main.ts`** is what distinguishes a Bitcoin Blake2b node from an
  ordinary Bitcoin node, by reading the length of a header. Nothing else does: the two chains share
  every block up to 961639, so a node's sync health check passes on both, and a dependency id is not
  evidence of a chain.
- **Header parsing** follows the length that a block's own version word claims: 80 bytes before the
  fork and 164 after it. Changes here want known answer vectors from real blocks on both sides of
  the activation height.

## Opening a pull request

Describe what the change does and why. If it touches one of the areas above, say how you tested it.

Before you open it:

- [ ] `npx tsc --noEmit` is clean and CI passes
- [ ] A design note in `docs/design/` for anything substantial, or an ADR in `docs/adr/` for a
      decision that would be expensive to reverse
- [ ] Tests for a fix, and evidence in the description for anything consensus sensitive
- [ ] README, `PLAN.md` or the docs updated if behaviour changed
- [ ] No secrets, no private infrastructure details, and no unpinned or unverified dependency

## Releases

Releases ship a `SHA256SUMS` file and a detached GPG signature, so a download can be verified
against a published key rather than trusted because of where it came from.
[`docs/verifying-a-release.md`](docs/verifying-a-release.md) is the procedure, and the public key is
in [`keys/`](keys).
