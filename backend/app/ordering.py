BASE_62_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_SMALLEST_INTEGER = "A" + BASE_62_DIGITS[0] * 26


def _midpoint(a: str, b: str | None, digits: str) -> str:
    zero = digits[0]
    if b is not None and a >= b:
        raise ValueError(f"{a} >= {b}")
    if a[-1:] == zero or (b and b[-1:] == zero):
        raise ValueError("trailing zero")
    if b:
        n = 0
        while n < len(b) and (a[n] if n < len(a) else zero) == b[n]:
            n += 1
        if n > 0:
            return b[:n] + _midpoint(a[n:], b[n:], digits)
    digit_a = digits.index(a[0]) if a else 0
    digit_b = digits.index(b[0]) if b is not None else len(digits)
    if digit_b - digit_a > 1:
        return digits[int(0.5 * (digit_a + digit_b) + 0.5)]
    if b and len(b) > 1:
        return b[:1]
    return digits[digit_a] + _midpoint(a[1:], None, digits)


def _integer_length(head: str) -> int:
    if "a" <= head <= "z":
        return ord(head) - ord("a") + 2
    if "A" <= head <= "Z":
        return ord("Z") - ord(head) + 2
    raise ValueError(f"invalid order key head: {head}")


def _validate_integer(value: str) -> None:
    if len(value) != _integer_length(value[0]):
        raise ValueError(f"invalid integer part of order key: {value}")


def _integer_part(key: str) -> str:
    length = _integer_length(key[0])
    if length > len(key):
        raise ValueError(f"invalid order key: {key}")
    return key[:length]


def validate_order_key(key: str, digits: str = BASE_62_DIGITS) -> None:
    if key == _SMALLEST_INTEGER:
        raise ValueError(f"invalid order key: {key}")
    integer = _integer_part(key)
    fraction = key[len(integer) :]
    if fraction[-1:] == digits[0]:
        raise ValueError(f"invalid order key: {key}")


def _increment_integer(value: str, digits: str) -> str | None:
    _validate_integer(value)
    head, digs = value[0], list(value[1:])
    carry = True
    i = len(digs) - 1
    while carry and i >= 0:
        d = digits.index(digs[i]) + 1
        if d == len(digits):
            digs[i] = digits[0]
        else:
            digs[i] = digits[d]
            carry = False
        i -= 1
    if not carry:
        return head + "".join(digs)
    if head == "Z":
        return "a" + digits[0]
    if head == "z":
        return None
    h = chr(ord(head) + 1)
    if h > "a":
        digs.append(digits[0])
    else:
        digs.pop()
    return h + "".join(digs)


def _decrement_integer(value: str, digits: str) -> str | None:
    _validate_integer(value)
    head, digs = value[0], list(value[1:])
    borrow = True
    i = len(digs) - 1
    while borrow and i >= 0:
        d = digits.index(digs[i]) - 1
        if d == -1:
            digs[i] = digits[-1]
        else:
            digs[i] = digits[d]
            borrow = False
        i -= 1
    if not borrow:
        return head + "".join(digs)
    if head == "a":
        return "Z" + digits[-1]
    if head == "A":
        return None
    h = chr(ord(head) - 1)
    if h < "Z":
        digs.append(digits[-1])
    else:
        digs.pop()
    return h + "".join(digs)


def key_between(a: str | None, b: str | None, digits: str = BASE_62_DIGITS) -> str:
    if a is not None:
        validate_order_key(a, digits)
    if b is not None:
        validate_order_key(b, digits)
    if a is not None and b is not None and a >= b:
        raise ValueError(f"{a} >= {b}")
    if a is None:
        if b is None:
            return "a" + digits[0]
        ib = _integer_part(b)
        fb = b[len(ib) :]
        if ib == _SMALLEST_INTEGER:
            return ib + _midpoint("", fb, digits)
        if ib < b:
            return ib
        res = _decrement_integer(ib, digits)
        if res is None:
            raise ValueError("cannot decrement any more")
        return res
    if b is None:
        ia = _integer_part(a)
        fa = a[len(ia) :]
        i = _increment_integer(ia, digits)
        return ia + _midpoint(fa, None, digits) if i is None else i
    ia = _integer_part(a)
    fa = a[len(ia) :]
    ib = _integer_part(b)
    fb = b[len(ib) :]
    if ia == ib:
        return ia + _midpoint(fa, fb, digits)
    i = _increment_integer(ia, digits)
    if i is None:
        raise ValueError("cannot increment any more")
    if i < b:
        return i
    return ia + _midpoint(fa, None, digits)


def n_keys_between(a: str | None, b: str | None, n: int, digits: str = BASE_62_DIGITS) -> list[str]:
    if n == 0:
        return []
    if n == 1:
        return [key_between(a, b, digits)]
    if b is None:
        c = key_between(a, b, digits)
        result = [c]
        for _ in range(n - 1):
            c = key_between(c, b, digits)
            result.append(c)
        return result
    if a is None:
        c = key_between(a, b, digits)
        result = [c]
        for _ in range(n - 1):
            c = key_between(a, c, digits)
            result.append(c)
        result.reverse()
        return result
    mid = n // 2
    c = key_between(a, b, digits)
    return [*n_keys_between(a, c, mid, digits), c, *n_keys_between(c, b, n - mid - 1, digits)]
