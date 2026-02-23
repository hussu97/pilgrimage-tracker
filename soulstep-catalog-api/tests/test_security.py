"""
Unit tests for app.core.security:
hash_password, verify_password, create_access_token, decode_token, create_refresh_token.

These are pure-function tests — no DB or HTTP needed.
"""

from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestHashAndVerifyPassword:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("MySecret1!")
        assert hashed != "MySecret1!"

    def test_verify_correct_password(self):
        hashed = hash_password("Correct1!")
        assert verify_password("Correct1!", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("Correct1!")
        assert verify_password("Wrong1234!", hashed) is False

    def test_hash_is_bcrypt_format(self):
        hashed = hash_password("Pass1234!")
        # Bcrypt hashes start with $2b$
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_two_hashes_of_same_password_differ(self):
        # Salt means identical plaintext produces different hashes
        h1 = hash_password("Same1234!")
        h2 = hash_password("Same1234!")
        assert h1 != h2

    def test_both_hashes_verify_correctly(self):
        h1 = hash_password("Same1234!")
        h2 = hash_password("Same1234!")
        assert verify_password("Same1234!", h1)
        assert verify_password("Same1234!", h2)


class TestJwtTokens:
    def test_access_token_is_string(self):
        token = create_access_token("usr_abc123")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_valid_token_returns_sub(self):
        user_code = "usr_test0001"
        token = create_access_token(user_code)
        result = decode_token(token)
        assert result == user_code

    def test_decode_invalid_token_returns_none(self):
        assert decode_token("not.a.jwt") is None
        assert decode_token("") is None
        assert decode_token("eyJhbGciOiJIUzI1NiJ9.bad.sig") is None

    def test_decode_tampered_token_returns_none(self):
        token = create_access_token("usr_real")
        header, payload, sig = token.split(".")
        # Modify a character in the middle of the signature.
        # Avoid the last 1-2 chars: in a 43-char base64url signature the final
        # character only encodes 4 meaningful bits (2 are padding), so flipping
        # the last char can leave the decoded bytes unchanged.
        mid = len(sig) // 2
        tampered_char = "B" if sig[mid] != "B" else "A"
        tampered_sig = sig[:mid] + tampered_char + sig[mid + 1 :]
        tampered = f"{header}.{payload}.{tampered_sig}"
        assert decode_token(tampered) is None

    def test_different_users_get_different_tokens(self):
        t1 = create_access_token("usr_alice")
        t2 = create_access_token("usr_bob")
        assert t1 != t2
        assert decode_token(t1) == "usr_alice"
        assert decode_token(t2) == "usr_bob"


class TestRefreshToken:
    def test_refresh_token_is_hex_string(self):
        token = create_refresh_token("usr_any")
        assert isinstance(token, str)
        # 48 bytes → 96 hex chars
        assert len(token) == 96
        assert all(c in "0123456789abcdef" for c in token)

    def test_each_refresh_token_is_unique(self):
        tokens = {create_refresh_token("usr_x") for _ in range(10)}
        assert len(tokens) == 10
