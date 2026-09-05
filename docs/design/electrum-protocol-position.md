# Design: our position on the Electrum protocol for a BLAKE2b chain

- **Issues:** #6 (`headers.subscribe`), #7 (`cp_height` proofs), #8 (chain identity)
- **Status:** draft, decisions open
- **Last updated:** 2026-09-05

This is the document those three issues were missing. They were one-line issue bodies against a
protocol change, which the guardrails do not allow: a protocol or consensus-adjacent change starts
with a design doc. It also exists so the decisions below are argued somewhere durable rather than
settled in conversation and forgotten.

Sections 1 to 3 are findings and should be uncontroversial. Section 4 is the open decisions, each
with a recommendation and a blank for the answer. Fill the blanks in this file.

## 1. There is already a specification, and it is not ours

`paulscode/electrs-pruned` carries `docs/electrum-header-v2.md`, **version 0.3, dated 2026-08-26**,
a 414-line draft titled "Electrum protocol: variable-length block headers". It addresses exactly
the ground covered by issues #6, #7 and #8. A copy is kept internally for reference; the canonical
version is in that repository and may have moved on.

It is a serious document. Its claims are verified against live chain data rather than read from
source, it records what its own implementations cost, and it lists its open questions honestly.

Its Status section says, in the author's words: "If someone is already doing this in Fulcrum or
ElectrumX, I would rather join that than duplicate it."

That sentence is the practical opening for everything below. Shulcrum is doing this in Fulcrum.

## 2. Two implementations of one idea, and they disagree

| | Shulcrum (Kilombino) | Spec v0.3 (paulscode) |
|---|---|---|
| Protocol version | 1.7 | 1.8 |
| How a client learns the rules changed | `blockchain.pow_algorithms` | version bump, plus refusal to serve below it |
| Chain identity | none | `server.features.blake2b_fork`, a fork point |
| `cp_height` header merkle | implemented (`85da430`) | **not implemented**, electrs has no `cp_height` at all |
| Client half | none | a Sparrow fork, working |
| Written spec | a README section | a versioned draft |

Both are live. Both serve the same chain. A wallet cannot cheaply satisfy both, and every extra
variant makes the protocol worth less to everyone on it.

Note the asymmetry in the last three rows. They have the client and the written spec, which we do
not. We have `cp_height`, which their own spec marks as the one server-side item unimplemented on
their side, because electrs does not implement `cp_height` at all.

## 3. Three things the spec gives us for free

These are findings from its implementation experience that our issues had listed as open work.

**For #6, `headers.subscribe`.** Refusing at `server.version` is not sufficient. A chain crosses its
activation height while clients are connected, so a client that negotiated an old version below the
activation keeps its session and is served a v2 header the moment the tip reaches activation. The
spec calls this "what happens on every fresh sync of a chain that has already forked". The version
rule therefore has to be enforced where headers are served, not only where the version is agreed,
and a subscribed client that can no longer read the tip has to be disconnected.

This is very likely the substance of the review Shulcrum's own `doc/blake2b-headers.md` says
`blockchain.headers.subscribe` still needs.

**For #7, `cp_height`.** The merkle leaves are block hashes, and on a transitioning chain that means
SHA256d below the activation height and BLAKE2b at or above it, in one tree, with the pairing
function above the leaves unchanged. That is exactly what Shulcrum's `85da430` implements, so #7 is
a validation task against a stated rule rather than open research.

**A trap for both.** Fixed-length assumptions are not only at the point where headers are sliced.
Their client had a second one a layer above, in the check that a response carries as many bytes as
it claims headers, and that one refused the chain before the slicing was ever reached. Grep for the
length, not for the slicing.

## 4. Open decisions

### D1. Do we back protocol 1.7 or 1.8?

Everything else follows from this one.

- **1.7, Shulcrum's choice.** Keeps our fork's diff at zero and asks nothing of anyone. Leaves two
  incompatible dialects in the wild, and leaves the client half unserved, since the working Sparrow
  fork implements 1.8.
- **1.8, the spec's choice.** One dialect, a written specification to point at, and a client that
  already speaks it. Costs a real change to Shulcrum and a much larger ask of its maintainer than
  "add a field".

**Recommendation: 1.8, and keep `blockchain.pow_algorithms` alongside it.** The spec is written
down, versioned and argued; it has two independent implementations including the half we cannot
easily build ourselves; and its `headers.subscribe` reasoning is more complete than the open TODO
we would otherwise be closing on our own judgement. We are the third party to arrive at this
problem, not the first, and a protocol with one dialect is worth more than our preference between
two. `pow_algorithms` should survive because it answers a question the version bump does not, which
algorithm applies from which height, and it does not conflict with negotiating 1.8.

The honest cost: this makes our first contribution to Shulcrum "adopt another project's protocol
decision", which is a large thing to ask of a maintainer who has not yet replied.

**Decision:**

### D2. Where does our protocol work land, and in what shape?

- Write our own competing specification.
- Adopt v0.3 as the reference and contribute against it.

**Recommendation: adopt, do not compete.** A third specification helps nobody. This document is our
position on v0.3, not a rival to it. Concretely that turns #6 and #7 from open research into
"validate against v0.3 section 2" and "validate against v0.3 section 4", and it gives #8 a shape
(the fork point) rather than an open design question.

**Decision:**

### D3. What do we contribute first?

**Recommendation: `cp_height`.** It is the one server-side item the spec marks unimplemented on its
own side, it is already implemented in the code we forked, and phase 3 will give us mainnet evidence
that it works across a real activation boundary. It is a contribution rather than an introduction,
and it is the strongest position we will have to open with.

**Decision:**

### D4. How is mainnet verification recorded?

The guardrails call mainnet verification "a first-class, recorded test, not a one-off". At present
the findings from phase 3 live in issue comments, which is not a test.

**Recommendation:** #5 produces a checked-in script plus mainnet golden vectors, extending the
existing testnet4 vectors with the mainnet activation pair at heights 961639 and 961640. Findings
that currently exist only as issue comments move into it, in particular that `getblockheader`'s
verbose JSON masks bit 31 off the version word while the raw serialization keeps it, so a hand check
against the JSON shows a false mismatch.

**Decision:**

### D5. Which already-made decisions become ADRs?

`docs/adr/` contains only the ADR that establishes ADRs. Several irreversible or architectural calls
have been made and recorded nowhere.

**Recommendation:** two, and no more. One for basing on Shulcrum rather than electrs or a fresh
Fulcrum fork; one for `extended_headers` being fixed true and never exposed, which is irreversible
per index database and is the reason the package declines a node picklist. The rest are ordinary
choices and would be noise.

**Decision:**

### D6. Who owns the client half?

The end goal needs a BLAKE2b-aware wallet. Sparrow derives the block id the wrong way. Two forks
exist: Shrike (`AcesHigh70/sparrow`, branch `blake2b-header`), named by Shulcrum's own
documentation, and the Sparrow fork described in spec v0.3. Nothing in our backlog tracks either.

**Recommendation: track it, do not build it.** File an issue naming it an external dependency, and
choose which fork we test against during phase 6. Building a wallet is not this project.

**Decision:**

## 5. What this does not change

Phase 3 comes first regardless. None of the above is actionable until the index exists: the
surfaces in #6 and #7 can only be exercised across the activation boundary, which means an index
that spans height 961640. Deciding D1 early is still worth it, because it determines whether the
work is shaped as a contribution to v0.3 or as a defence of 1.7.
