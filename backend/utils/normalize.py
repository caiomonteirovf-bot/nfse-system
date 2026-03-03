import re
import unicodedata


def normalize_text(value, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def normalize_stage(value, fallback: str = "") -> str:
    """Normalize stage/status: strip accents, uppercase, trim."""
    if value is None:
        return fallback
    text = str(value).strip()
    if not text:
        return fallback
    nfkd = unicodedata.normalize('NFD', text)
    ascii_text = ''.join(c for c in nfkd if unicodedata.category(c) != 'Mn')
    return ascii_text.upper()


def normalize_number(value) -> float:
    if isinstance(value, (int, float)):
        return value if not (value != value) else 0.0  # NaN check

    if isinstance(value, str):
        clean = value.replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
        try:
            parsed = float(clean)
            return parsed if parsed == parsed else 0.0
        except (ValueError, TypeError):
            return 0.0

    return 0.0


def normalize_integer(value) -> int:
    parsed = round(normalize_number(value))
    return max(parsed, 0)
