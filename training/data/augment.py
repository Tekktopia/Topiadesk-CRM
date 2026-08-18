"""Paraphrase augmentation for the ~17 real app-help facts.

Manually authored (not an API-paraphraser call) per the approved plan's
tradeoff: at this small a scale, a human writing variants directly produces
higher-quality data (each variant is checked to not silently change the
meaning of an insurance-process fact) and avoids introducing a new external
API dependency for something this size. Each original question maps to 4-6
additional phrasings; the answer is reused verbatim (or lightly reworded
where a variant's phrasing makes verbatim repetition awkward) — these are
matched to app-help-corpus.ts's 17 `question` strings by exact text, so if
that file's wording ever changes, re-check this mapping still applies.
"""

from __future__ import annotations

# question -> list of paraphrased ways a user might actually ask the same thing
PARAPHRASES: dict[str, list[str]] = {
    "how do I create a new lead": [
        "what's the process for adding a new lead",
        "steps to make a new lead entry",
        "how can I add a lead to the system",
        "where do I go to create a lead",
        "can you walk me through creating a lead",
    ],
    "how do I convert a lead to an opportunity": [
        "how do I turn a lead into an opportunity",
        "what's the process for converting a lead",
        "steps to convert a lead into a deal",
        "how do I qualify a lead into an opportunity",
        "can a lead become an opportunity, and how",
    ],
    "how do I add a new policy": [
        "steps to create a new policy",
        "how can I add a policy to an account",
        "where do I go to write a new policy",
        "what's the process for adding a policy",
        "how do I set up a new policy for a client",
    ],
    "what is KYC and how does it work": [
        "can you explain KYC",
        "what does KYC mean here",
        "how does KYC verification work",
        "what's the deal with KYC status",
        "why do I need to worry about KYC",
    ],
    "how do commissions work for producers": [
        "how is producer commission calculated",
        "explain how commissions are tracked",
        "how do I know what a producer earns on a policy",
        "what's the commission process for producers",
        "how are producer commissions figured out",
    ],
    "how do renewals work": [
        "can you explain the renewal process",
        "how does policy renewal work here",
        "what happens when a policy comes up for renewal",
        "how are renewals tracked",
        "explain how renewals are handled",
    ],
    "how do I file or track a claim": [
        "how do I submit a claim",
        "what's the process for filing a claim",
        "how can I track a claim's status",
        "where do I go to log a claim",
        "steps to file a claim for a client",
    ],
    "how do I create a report": [
        "how can I build a custom report",
        "steps to generate a report",
        "where do I go to make a report",
        "how do I set up a report",
        "can you explain how to build a report",
    ],
    "how do I see my dashboard and KPIs": [
        "where can I check my KPIs",
        "how do I view my dashboard",
        "what's on my dashboard",
        "how do I see my performance metrics",
        "where do I find my numbers",
    ],
    "how do I log an activity or note on an account": [
        "how do I add a note to an account",
        "steps to log a call on an account",
        "how can I record an activity",
        "where do I log a meeting note",
        "how do I keep track of what happened on an account",
    ],
    "how do I manage support cases or tickets": [
        "how do I handle support tickets",
        "where do I manage cases",
        "how can I work through support cases",
        "what's the process for handling tickets",
        "how do I deal with open cases",
    ],
    "how do I add a new account or client": [
        "how do I create a new client account",
        "steps to add a new account",
        "how can I onboard a new client",
        "where do I go to add a client",
        "how do I set up a new account",
    ],
    "what is the difference between a lead and an opportunity": [
        "whats the actual difference between a lead and an opportunity",
        "how are leads different from opportunities",
        "lead vs opportunity, what's the distinction",
        "what separates a lead from an opportunity",
        "explain lead versus opportunity",
    ],
    "how do I check pipeline value or open deals": [
        "what's my pipeline worth right now",
        "how do I see my open deals",
        "where can I check pipeline value",
        "how do I find out what's in my pipeline",
        "what deals do I have open",
    ],
    "how do I assign a case to someone": [
        "how do I reassign a case",
        "steps to assign a ticket to a teammate",
        "how can I hand off a case",
        "where do I set who owns a case",
        "how do I route a case to someone",
    ],
    "how do household or corporate group accounts work": [
        "explain household accounts",
        "how do corporate group accounts work",
        "what's a household account for",
        "how does account hierarchy work",
        "can you explain group premium rollup",
    ],
    "how do I search the knowledge base": [
        "how do I find help articles",
        "where's the knowledge base",
        "how can I search for help",
        "how do I look something up in the KB",
        "where do I go for documentation",
    ],
}


def augment(entries: list[dict[str, str]]) -> list[dict[str, str]]:
    """Returns the original entries plus their paraphrased variants — all sharing the same answer."""
    augmented: list[dict[str, str]] = []
    unmapped: list[str] = []
    for entry in entries:
        augmented.append(entry)
        variants = PARAPHRASES.get(entry["question"])
        if variants is None:
            unmapped.append(entry["question"])
            continue
        for variant in variants:
            augmented.append({"question": variant, "answer": entry["answer"]})

    if unmapped:
        import sys

        print(
            f"WARNING: {len(unmapped)} app-help question(s) have no paraphrase "
            f"variants (app-help-corpus.ts's wording may have changed): {unmapped}",
            file=sys.stderr,
        )

    return augmented
