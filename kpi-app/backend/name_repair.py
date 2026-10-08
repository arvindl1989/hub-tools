"""Names that arrive mangled, and what they should read as.

Some requester names come through a charset that cannot hold Central European
letters. Every character outside Latin-1 arrives as a literal question mark
while the ones inside it survive, so "Martina Kotoučová" reaches us as
"Martina Kotou?ová" — the ó and á intact, only the č lost. The same happens to
ł, ż and ń in the Polish names.

A question mark carries no trace of what it replaced, so there is nothing to
decode and no rule to infer: a repair is only possible for names someone has
told us the correct spelling of. Hence a list rather than an algorithm.

The mangled shapes are derived from the correct spelling rather than copied
out of the data, which matters for two reasons. A name cannot be entered with
a typo in the half nobody reads, and a name that is only partly mangled — or
mangled with U+FFFD instead of "?" by some other export — is still matched,
because every combination is generated.

To add a name, add its correct spelling to CORRECT_NAMES. Nothing else.
"""
from __future__ import annotations

from itertools import product

CORRECT_NAMES: list[str] = [
    "Martina Kotoučová",
    "Michał Żyszko",
    "Małgorzata Siekierzyńska-Rudowska",
]

# What a character that will not fit turns into. A literal question mark is
# what the current export produces; U+FFFD is what a decoder that notices
# would produce, and costs nothing to cover.
_PLACEHOLDERS = ("?", "�")


def _fits_latin1(ch: str) -> bool:
    try:
        ch.encode("latin-1")
        return True
    except UnicodeEncodeError:
        return False


def _variants(name: str) -> set:
    """Every shape this name can arrive in, including unharmed.

    Each character that does not fit is independently either itself or one of
    the placeholders, so a name mangled in part is caught as well as one
    mangled throughout.
    """
    slots = [(ch,) if _fits_latin1(ch) else (ch, *_PLACEHOLDERS) for ch in name]
    return {"".join(combo) for combo in product(*slots)}


# Mangled spelling → correct spelling. The identity entry is harmless: a name
# that arrived intact maps to itself.
NAME_REPAIRS: dict = {
    variant: name for name in CORRECT_NAMES for variant in _variants(name)
}


def repair(value):
    """The corrected name, or the value untouched.

    Anything that is not a known mangling is returned exactly as it came —
    including non-strings, so this can be mapped over a whole column or row
    without having to know which cells hold names.
    """
    if not isinstance(value, str):
        return value
    fixed = NAME_REPAIRS.get(value.strip())
    return fixed if fixed is not None else value


def repair_row(row: dict) -> dict:
    """A row with any mangled name in it corrected, whichever column it is in."""
    return {k: repair(v) for k, v in row.items()}
