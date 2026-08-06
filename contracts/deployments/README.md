# Deployments

`forge script script/Deploy.s.sol --rpc-url <url> --broadcast` writes
`deployments.<chainId>.json` here (e.g. `deployments.4663.json` for Robinhood
Chain, `deployments.8453.json` for Base, `deployments.31337.json` for a local
anvil fork). The web app (`apps/web/lib/deployments.ts`) and the docs addresses
page read these files; the keeper bots read them by chain id too. Do not hand-edit —
re-run the script.
