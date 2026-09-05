# Building the Shulcrum server

There are two builds in this project and they answer different questions. Know which one you want
before you start.

| | Where | For |
|---|---|---|
| **Packaged** | the repo's `Dockerfile`, driven by `make` | What ships. Runs inside the `.s9pk`, and is the build users install |
| **Standalone** | `scripts/build-shulcrum.sh` | A bare binary to run outside a package. The mainnet verification harness uses it |

They compile the same source with the same flags, deliberately. Where they drift the `Dockerfile`
wins, because it is the one users get.

Nothing is installed on the host either way. The toolchain lives in a container and goes away with
it.

## The standalone build

```sh
scripts/build-shulcrum.sh /path/to/shulcrum-source ./build
```

The source tree is mounted read only and copied inside the container, so a build cannot modify the
tree it came from. The result is `./build/Shulcrum`, and the script prints its SHA256.

**On a machine that is also running an index, cap the parallelism:**

```sh
JOBS=4 scripts/build-shulcrum.sh /path/to/shulcrum-source ./build
```

A full width Qt5 compile beside a live indexer is what ran a 31 GB host out of memory once, and the
symptom was not a memory message: it surfaced as `fatal: early EOF` from a `git clone` inside the
build, which reads like a network fault. If a build fails strangely, check free memory before you
touch the Dockerfile.

## What the recipe actually is

Ubuntu 24.04, the distribution's Qt5 and RocksDB, no vendored dependencies:

```sh
apt-get install -y --no-install-recommends \
  build-essential pkg-config git ca-certificates \
  qtbase5-dev qtbase5-dev-tools \
  librocksdb-dev libzmq3-dev libjemalloc-dev libminiupnpc-dev \
  libssl-dev libbz2-dev zlib1g-dev

qmake ../Fulcrum.pro CONFIG+=release \
  "LIBS+=-lrocksdb -lz -lbz2 -lzmq -lminiupnpc -ljemalloc"
make -j"$(nproc)"
```

Two things about that are not obvious.

**The `LIBS+=` line is required, not decoration.** The `.pro` file expects the upstream static recipe
to have supplied those libraries. Without it the compile succeeds and the link fails on symbols from
rocksdb, zmq, miniupnpc and jemalloc.

**The distribution RocksDB works unmodified.** 24.04 ships librocksdb 8.9.1 and this revision builds
against it with no patches, so there is no pinned or vendored RocksDB to carry. That was expected to
be the hard part and turned out not to be one.

## Running what you built

The binary is **dynamically linked** against that image's Qt5 and RocksDB, so it runs where those
sonames exist and nowhere else. Do not expect it to run on the host. Run it in a container built from
the same base carrying the runtime libraries only:

```
libqt5network5 librocksdb8.9 libzmq5 libminiupnpc17 libjemalloc2 libssl3 libbz2-1.0 zlib1g
```

The repo's `Dockerfile` final stage is exactly that list, and is the reference for it. Running the
binary in a clean runtime container rather than in its build tree is also the only way to prove it is
a working binary rather than something that only executes where it was made.

Confirm what you have:

```sh
./Shulcrum --version
sha256sum ./Shulcrum
```

The version line carries the git commit it was built from. A `-dirty` suffix means the source tree
had uncommitted changes, which is fine for a test binary and disqualifying for anything released.

## The upstream static recipe, and why we do not use it

Upstream carries its own build under `contrib/build/linux/`: a Dockerfile per Ubuntu release plus
`_build.sh`, which builds RocksDB, jemalloc and miniupnpc from pinned commits and links them
statically. Its output is a portable binary that runs on any x86_64 Linux regardless of what is
installed.

That is the right recipe for shipping a standalone binary to strangers, and the wrong one here. We
ship a `.s9pk` containing its own runtime, so portability across distributions buys us nothing, while
the static build takes considerably longer and adds three dependencies to pin, verify and track for
security fixes. Use it if you need a binary to hand someone directly; otherwise the distribution
build is faster and has fewer moving parts.

## Reproducing a specific revision

Build from a tag rather than a branch. The version string records the commit, so a binary can always
be traced back:

```sh
git -C /path/to/shulcrum-source checkout v2.1.2-blake2b.1
scripts/build-shulcrum.sh /path/to/shulcrum-source ./build
```
