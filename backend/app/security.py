import hashlib
import secrets

from pwdlib import PasswordHash

_password_hash = PasswordHash.recommended()
_DUMMY_HASH = _password_hash.hash("dummy-password-for-timing")

AVATAR_COLORS = [
    "#E5484D",
    "#F76B15",
    "#FFB224",
    "#30A46C",
    "#12A594",
    "#0090FF",
    "#3E63DD",
    "#8E4EC6",
    "#D6409F",
    "#978365",
]


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    if password_hash is None:
        _password_hash.verify(password, _DUMMY_HASH)
        return False, None
    return _password_hash.verify_and_update(password, password_hash)


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def pick_color(seed: str) -> str:
    digest = hashlib.sha256(seed.encode()).digest()
    return AVATAR_COLORS[digest[0] % len(AVATAR_COLORS)]
