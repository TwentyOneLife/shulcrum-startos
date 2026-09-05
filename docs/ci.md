# Building and CI

How this package is built, and the environment traps that have already cost a red CI run each. Read
the checklist before changing `.github/workflows/ci.yml`.

## The pipeline

`.github/workflows/ci.yml` runs on pull requests and on pushes to `main`. Three jobs:

| Job | What it proves |
|---|---|
| `validate` | The repo still has its README, licence, contributing guide and ADR index. |
| `no-internal-refs` | No tracked file carries a private address, a local path or an onion name. |
| `build-s9pk` | `start-cli` is genuinely the binary we pinned, and the package builds and signs. |

`build-s9pk` fetches `start-cli`, checks it by SHA256 and by two GPG signatures, marks a packaging
workspace, builds the `.s9pk` and uploads it. `TOOLCHAIN.md` records what is pinned and why the keys
come from a keyserver rather than from the release archive.

## Before you change the workflow

A CI run is a slow test loop, and each red run costs several minutes to reach the same line. Three
habits, in order:

1. **Research the tool before writing the step.** Read the error text literally, read the tool's own
   `--help`, and read the vendored source under `node_modules` when the behaviour is a dependency's
   rather than ours. Every failure below was a case where the tool's actual behaviour differed from
   how it was assumed to work.
2. **Reproduce locally in the shape CI has**, not the shape your workstation has. See
   "Reproducing a CI failure" below. A workstation is not a hosted runner and the differences are
   exactly where these failures live.
3. **Then push.** One verified change beats three plausible ones.

## Traps already paid for

### The packaging workspace is found by physical path

`start-cli s9pk pack` requires a *workspace*, the directory that contains package repos, not the
package repo itself. It resolves the physical path of the working directory, so marking some other
directory and symlinking the checkout into it does not work: it sees the real checkout and looks in
the real parent.

On a runner the parent of `$GITHUB_WORKSPACE` already exists, so mark it in place.

### A workspace marker is two files, not one

A `.startos/` holding only `config.yaml` is reported **exactly** as if no workspace existed at all:
`No packaging workspace found`. It needs `build.key.pem` beside it before `start-cli` recognises the
directory.

This matters because the two mistakes above produce the identical error, so fixing only the path
looks like the fix did nothing.

### `init-workspace` is not usable in CI

`start-cli s9pk init-workspace` creates a correct workspace, and also clones the whole Start9
monorepo (over three thousand files) and generates a **fresh signing key**. A package signed by a
different key on every build is a different publisher on every build. CI writes the two files itself
and restores the key from the `S9PK_BUILD_KEY` secret.

### The default buildx driver cannot export the image

`start-cli` asks buildx for a docker format export of the service image. A hosted runner's default
builder uses the `docker` driver, which cannot produce one:

```
ERROR: failed to build: Docker exporter is not supported for the docker driver.
```

This does not reproduce on a workstation whose Docker has the **containerd image store** turned on,
where the default driver handles the export. Check yours with `docker info | grep -i containerd`
before concluding a failure is in the package. CI creates a `docker-container` builder, which runs
BuildKit in its own container and supports the exporter.

### The SDK's dependency check does not cover the host tools

`make` runs the SDK's `check-deps`, which looks for `start-cli`, `npm`, `git` and `jq`. `start-cli`
also shells out to **`tar2sqfs`** and **`mksquashfs`** to turn the exported image into squashfs, and
`check-deps` does not look for either. A runner without them compiles the whole of Shulcrum, exports
the image, and only then fails:

```
Docker Error: tar2sqfs: No such file or directory (os error 2)
```

On Ubuntu these come from `squashfs-tools-ng` and `squashfs-tools` respectively. Neither is present
on a hosted runner, and neither was present on the workstation either, which is why no local build
had ever reached this stage.

If you add a step that calls `start-cli`, check what the binary itself invokes rather than trusting
`check-deps`:

```sh
strings start-cli | grep -E 'tar2sqfs|mksquashfs|docker|buildx'
```

### A green watch command is not a green run

`gh run watch --exit-status` has exited 0 on a run whose conclusion was `failure`. Read the run's own
verdict instead:

```sh
gh run view <run-id> --json conclusion,jobs \
  --jq '"conclusion: \(.conclusion)", (.jobs[] | "  \(.name): \(.conclusion)")'
```

### Do not build while a verification index is running

The Shulcrum build compiles Qt5 sources and is memory hungry. Run beside a live indexer and the host
can run out of memory. When that happens the *visible* symptom is usually not a memory message: an
`index-pack` killed mid-clone surfaces as

```
fatal: early EOF
fatal: fetch-pack: invalid index-pack output
```

which reads like a network fault or a bad ref, and sent one investigation down the wrong path. If a
clone fails inside a Docker build, check free memory and what else was running before you touch the
Dockerfile.

### Actions are pinned to commit SHAs

A tag moves. A moving third-party action is an unpinned dependency holding write access to the
build. Each `uses:` carries its semver in a trailing comment; update both together.

## Reproducing a CI failure

Most of these were diagnosed without pushing, by mounting this repo into a container at a path whose
parent is controllable, which reproduces the runner's physical-path layout:

```sh
docker run --rm \
  -v "$PWD":/ws/pkg:ro \
  -v /path/to/start-cli:/usr/local/bin/start-cli:ro \
  node:22-slim bash -c '
    mkdir -p /ws/.startos
    printf "schema: 1\nregistry:\n  default: https://registry.start9.com\n" > /ws/.startos/config.yaml
    cd /ws/pkg && start-cli s9pk pack --arch=x86_64 -o /tmp/x.s9pk
  '
```

Vary one thing at a time and watch which error you get. `start-cli` needs `node` on `PATH`, so run it
in a container that has one rather than on a bare host.

Typechecking needs no workspace at all:

```sh
docker run --rm -v "$PWD":/w -w /w node:22-slim node_modules/.bin/tsc --noEmit
```

## Secrets

`S9PK_BUILD_KEY` is the s9pk root signing key, held as an Actions secret and never in the tree. The
build fails loudly when it is empty rather than quietly signing with a generated key. If it is ever
rotated, the package's identity to a registry changes, which is why the workflow prints the root
signature commitment on every build: a key change shows up in the log rather than at install time.
