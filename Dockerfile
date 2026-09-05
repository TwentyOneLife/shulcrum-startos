# Shulcrum is built from source here rather than pulled as a binary: nothing is downloaded that
# would need verifying by hash and signature at install time, and the whole chain from source
# revision to running server stays auditable.
FROM ubuntu:24.04 AS builder

ARG SHULCRUM_REPO=https://github.com/TwentyOneLife/Shulcrum.git
# Pinned to a tag, never a branch. A moving ref would make the image unreproducible and would let
# a consensus-adjacent change reach a release without passing through a version bump here.
ARG SHULCRUM_REF=v2.1.2-blake2b.1

RUN apt-get -qq update \
 && DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends \
      build-essential ca-certificates git pkg-config \
      qtbase5-dev qtbase5-dev-tools \
      librocksdb-dev libzmq3-dev libjemalloc-dev libminiupnpc-dev \
      libssl-dev libbz2-dev zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 --branch "$SHULCRUM_REF" "$SHULCRUM_REPO" src

# Distro Qt5 against system RocksDB. Verified to build this revision unmodified on 24.04's
# librocksdb 8.9.1, so there is no vendored or pinned RocksDB to carry.
RUN mkdir build && cd build \
 && qmake ../src/Fulcrum.pro CONFIG+=release \
      "LIBS+=-lrocksdb -lz -lbz2 -lzmq -lminiupnpc -ljemalloc" \
 && make -j"$(nproc)"

FROM ubuntu:24.04 AS final

# Runtime libraries only. Must track the builder's base release: the binary links against this
# release's Qt5 and RocksDB soname, so the two stages cannot drift apart.
RUN apt-get -qq update \
 && DEBIAN_FRONTEND=noninteractive apt-get -qq install -y --no-install-recommends \
      bash curl ca-certificates \
      libqt5network5 librocksdb8.9 libzmq5 libminiupnpc17 libjemalloc2 \
      libssl3 libbz2-1.0 zlib1g \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/build/Fulcrum /usr/local/bin/shulcrum

WORKDIR /mnt/shulcrum

# Fulcrum flushes its RocksDB index on a clean shutdown. SIGTERM is the default and is what it
# handles; an abrupt stop on a large index means a slow consistency check on the next start.
STOPSIGNAL SIGTERM
