from app.security import create_token, decode_token, hash_password, verify_password


def test_password_hash_round_trip():
    hashed = hash_password("a-secure-password")
    assert hashed != "a-secure-password"
    assert verify_password("a-secure-password", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_round_trip():
    token = create_token("user-123", "access")
    assert decode_token(token, "access") == "user-123"

