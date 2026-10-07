# Reviewed transaction workflow

The broadcast console treats review as approval of a specific operation and input snapshot. It binds that approval to the signer instance, identity, network, trust mode, SDK instance and session, connection readiness, and component lifetime. Bigint amounts survive the snapshot unchanged. A changed context returns the user to Build and clears destructive and mainnet confirmations.

The form remains mounted during Review so asynchronous form data cannot change inputs unnoticed. Execution uses a separate copy of the reviewed inputs. Each executor checks the approved context again immediately before entering an SDK write method, after signing preparation and any prerequisite reads. Leaving the form or aborting the SDK session prevents a prepared but unsubmitted operation from proceeding. An SDK call already in progress retains its original operation, identity, and network receipt.

## Capabilities

Every registered operation declares its signing path before review. The shell checks available on-chain keys and blocks review while validation is pending, unavailable, or incompatible. Executors and capability checks use the same operation requirement table. Local adapters check current keys again during signing preparation.

Retrying a failed key check refreshes both the signer card and the operation's capability check. Review stays disabled until the new capability check succeeds; retrying does not submit a transaction.

Top-up runs in the external bridge and has no explorer broadcast button. Raw transition broadcast and voting show their unsupported state immediately. Changing network or signer resets the external top-up identity as well.

## Outcomes

- **Not submitted:** preparation, local validation, prerequisite read, or session checks failed before entering a write method. The user may return to Build and perform a fresh review.
- **Succeeded:** the SDK write resolved and the executor produced its receipt. All query variants for the submitted network are invalidated.
- **Unknown:** a write method failed or receipt construction failed after entering a write method. The SDK does not expose a reliable broadcast boundary or a typed definitive network rejection. The console does not offer Retry or resubmit. It provides affected entity identifiers and Refresh status so the user can investigate first.

Unknown does not imply rejection, and a refreshed balance alone may not establish the outcome of one particular transition. No public transaction is sent by regression tests. The SDK does not consistently return a transition identifier, so receipts only show identifiers actually available from prepared entities, options, and results.

## Receipts and navigation

Receipts show the original operation, network, trust mode, signer identity, start time, result, and affected identity/recipient/contract/document links. Entity links include the origin network and the configured static base path. Full navigation rehydrates the URL network even when the shared SDK provider would otherwise survive client navigation.

Successful contract registration retains document-type creation shortcuts, and successful document creation retains its repeat-creation link. Those links also keep the receipt's network and static base path.

Regression tests cover context invalidation, immutable bigint inputs, mainnet confirmation reset, readiness gating, delayed preparation, session abort, unmount, duplicate clicks, unknown outcomes, signing-material cleanup, receipt errors, capability failures, and network-scoped receipts. Form tests cover pure JSON validation, contract-schema replacement, and strict disable-key identifiers.
