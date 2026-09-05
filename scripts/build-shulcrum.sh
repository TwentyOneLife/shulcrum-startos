#!/usr/bin/env bash
#
# Build the Shulcrum server binary from a source tree, in a container.
#
# This is the standalone build, for running the server outside a package: the verification harness
# that indexes a live chain uses it. The packaged build is the repo's Dockerfile, which the .s9pk
# uses and which is the one that ships. Keep them producing the same binary from the same revision;
# where they differ, the Dockerfile wins, because it is what users install.
#
# Nothing is installed on the host. The toolchain lives in the container and is discarded with it.
#
# Usage:
#   scripts/build-shulcrum.sh <source-tree> [output-dir]
#
# Requires docker access. `sg docker -c '...'` or `newgrp docker` first if your shell was opened
# before you were added to the group, which is a surprisingly easy hour to lose.
set -euo pipefail

SRC=${1:?usage: build-shulcrum.sh <source-tree> [output-dir]}
OUT=${2:-./build}
IMAGE=${IMAGE:-ubuntu:24.04}
# Parallelism. Defaults to every core, which is right on a dedicated machine and wrong on one that
# is also running an index: a full-width Qt5 compile beside a live indexer is what ran this host out
# of memory once already. Set JOBS lower when sharing.
JOBS=${JOBS:-0}

[ -f "$SRC/Fulcrum.pro" ] || {
  echo "no Fulcrum.pro under $SRC; that is not a Shulcrum source tree" >&2
  exit 1
}

SRC=$(cd "$SRC" && pwd)
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)

echo "source: $SRC"
echo "output: $OUT"
echo "image:  $IMAGE"
if [ "$JOBS" = 0 ]; then echo "jobs:   all cores"; else echo "jobs:   $JOBS"; fi

# The source is mounted read-only and copied inside, so a build cannot touch the tree it came from.
docker run --rm -e JOBS="$JOBS" -v "$SRC":/src:ro -v "$OUT":/out "$IMAGE" bash -c '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get -qq update
  # Distro Qt5 against the distribution RocksDB. Verified to build this revision unmodified on
  # 24.04, so there is no vendored or pinned RocksDB to carry, unlike the upstream static recipe.
  apt-get -qq install -y --no-install-recommends \
    build-essential pkg-config git ca-certificates \
    qtbase5-dev qtbase5-dev-tools \
    librocksdb-dev libzmq3-dev libjemalloc-dev libminiupnpc-dev \
    libssl-dev libbz2-dev zlib1g-dev

  git config --global --add safe.directory /work
  cp -a /src /work
  cd /work && rm -rf build && mkdir build && cd build

  # LIBS are passed explicitly because the .pro file expects the static recipe to have supplied
  # them. Without this the link fails on symbols from rocksdb, zmq, miniupnpc and jemalloc.
  qmake ../Fulcrum.pro CONFIG+=release \
    "LIBS+=-lrocksdb -lz -lbz2 -lzmq -lminiupnpc -ljemalloc"
  if [ "$JOBS" = 0 ]; then JOBS=$(nproc); fi
  echo "building with -j$JOBS"
  make -j"$JOBS"

  ./Fulcrum --version 2>/dev/null | head -3 || true
  cp -f Fulcrum /out/Shulcrum
  echo BUILD_OK
'

echo
echo "binary: $OUT/Shulcrum"
sha256sum "$OUT/Shulcrum"
echo
echo "It is dynamically linked against this image's Qt5 and RocksDB, so it runs only where those"
echo "sonames exist. Run it in a container built from the same base, not on the host."
