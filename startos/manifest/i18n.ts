/**
 * Only en_US for now. The SDK types these as open records, so a partial set typechecks, and a
 * machine translation of a consensus-adjacent description is worse than an honest absence.
 * Translations land before release, from someone who speaks the language.
 */
export const nodeDescription = {
  en_US: 'Supplies the blocks and transactions this server indexes, over its RPC interface.',
}

export const short = {
  en_US: 'An Electrum server for the Bitcoin Blake2b chain',
}

export const long = {
  en_US:
    'Shulcrum indexes the Bitcoin Blake2b chain and serves it to Electrum wallets, so a wallet can track its balances and transaction history without asking anyone else about its addresses. It is a fork of Fulcrum that reads, stores and serves block headers at the length their own version word claims, 80 bytes before the BLAKE2b fork and 164 after it, and identifies blocks by their proof-of-work hash. It requires a Bitcoin Blake2b node with a full, unpruned copy of the chain and a transaction index.',
}
