# Exploring known entities

The explorer queries Dash Platform directly through the SDK. It does not maintain a global index of identities, contracts, tokens, or holders.

Search accepts known identifiers and other supported input formats. An empty query asks for input; an invalid format explains how to correct it. Only completed, successful lookups can report that no entity was found. Failed lookups remain visible with Retry, including partial failures when another entity type resolved. Public-key-hash search checks non-unique keys after a successful empty unique-key lookup. Format-only destinations such as epoch and transaction-hash pages are labelled as lookups, without claiming that the entity exists.

Use **Save identity**, **Save contract**, or **Save token** on an entity page to add it to **Saved items**. This is one local collection, with filters for network and entity type. An item is identified by its entity type, ID, and network, so saving the same ID on two networks keeps both contexts. The collection holds up to 100 items and asks you to remove an item at the limit. It is stored only in this browser. Remove and Clear all delete explicit saved items; storage failures are shown rather than reported as success.

**Copy share link** preserves the actual page URL, including a deployed path prefix, entity parameters, and fragment, and adds the selected network. Custom devnet links require the recipient to configure that devnet in Settings first. Links between touched owners, contracts, documents, and tokens carry the current network too.

The opt-in viewed-identity history is separate from explicit saved items. In **Settings → Local exploration history**, Clear viewed identities keeps consent but empties the log. Turning remembering off deletes both consent and history and updates mounted views and other tabs. A later opt-in starts empty. If browser storage refuses deletion, the current page hides the history and reports that persisted browser data still needs to be cleared.
