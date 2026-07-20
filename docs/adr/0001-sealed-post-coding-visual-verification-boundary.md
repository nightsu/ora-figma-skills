# Use a sealed contract and a read-only post-coding visual verifier

Keep `figma-assets-validate` responsible for design-side baselines and introduce a separate `figma-implementation-verify` lifecycle for contract draft, user-approved seal, post-coding verification, and result checking. The verifier may run and inspect the business application but must not modify business code; only machine-generated evidence that can be recomputed against the sealed contract and current Verification Subject can satisfy Coding Complete.

## Considered Options

- Extending P15 was rejected because P15 runs before implementation and should not own business runtime knowledge.
- A handwritten completion checklist was rejected because it cannot prove that a real implementation page was captured or compared.
- Automatic business-code repair was rejected because this repository prepares, verifies, and hands off implementation evidence rather than modifying business projects directly.

## Consequences

- Planning may receive a Verification Contract Draft, but coding cannot begin until the user approves and seals it.
- Visual failures become blocking findings for the downstream coding agent; the verifier stays read-only and reruns after fixes.
- Coding Complete means the sealed contract's required coverage passed for the current Verification Subject, not that every state, browser, or device was validated.
