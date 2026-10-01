import pytest

from app.ordering import key_between, n_keys_between


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        (None, None, "a0"),
        (None, "a0", "Zz"),
        ("a0", None, "a1"),
        ("a1", None, "a2"),
        ("a0", "a1", "a0V"),
        ("a1", "a2", "a1V"),
        ("a0V", "a1", "a0l"),
        ("Zz", "a0", "ZzV"),
        ("Zz", "a1", "a0"),
        ("bzz", None, "c000"),
        ("a0", "a0V", "a0G"),
        ("a0", "a0G", "a08"),
        ("b125", "b129", "b127"),
        ("a0", "a1V", "a1"),
        ("Zz", "a01", "a0"),
        (None, "a0V", "a0"),
        (None, "b999", "b99"),
    ],
)
def test_key_between_matches_fractional_indexing(a, b, expected):
    assert key_between(a, b) == expected


@pytest.mark.parametrize(("a", "b"), [("a1", "a0"), ("a0", "a0"), ("a0", "a00")])
def test_key_between_rejects_invalid_input(a, b):
    with pytest.raises(ValueError):
        key_between(a, b)


def test_n_keys_are_strictly_increasing_and_bounded():
    for a, b in [(None, None), ("a0", None), (None, "a0"), ("a0", "a1"), ("b125", "b129")]:
        keys = n_keys_between(a, b, 25)
        assert keys == sorted(keys) and len(set(keys)) == 25
        assert a is None or keys[0] > a
        assert b is None or keys[-1] < b


def test_sequential_keys_roll_over_integer_length():
    keys = n_keys_between(None, None, 70)
    assert keys[:3] == ["a0", "a1", "a2"]
    assert keys[61] == "az" and keys[62] == "b00"
