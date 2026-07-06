from __future__ import annotations

import re
from unittest.mock import MagicMock, patch

import pytest

from website_analyzer.auth import _generate_password, register_user, verify_user


class TestGeneratePassword:
    def test_length(self):
        pw = _generate_password()
        assert len(pw) == 12

    def test_has_lowercase(self):
        pw = _generate_password()
        assert re.search(r"[a-z]", pw)

    def test_has_uppercase(self):
        pw = _generate_password()
        assert re.search(r"[A-Z]", pw)

    def test_has_digit(self):
        pw = _generate_password()
        assert re.search(r"\d", pw)

    def test_no_whitespace(self):
        pw = _generate_password()
        assert " " not in pw

    def test_unique(self):
        pws = {_generate_password() for _ in range(50)}
        assert len(pws) > 40


class TestRegisterUser:
    @patch("website_analyzer.auth._cognito")
    def test_register_success(self, mock_cognito_factory):
        mock_cognito = MagicMock()
        mock_cognito_factory.return_value = mock_cognito
        mock_cognito.sign_up.return_value = {}

        result = register_user("Alice", "alice@example.com")
        assert result["message"] == "Verification code sent to email."
        assert result["email"] == "alice@example.com"
        mock_cognito.sign_up.assert_called_once()

    @patch("website_analyzer.auth._cognito")
    def test_register_existing_email(self, mock_cognito_factory):
        mock_cognito = MagicMock()
        mock_cognito_factory.return_value = mock_cognito
        from botocore.exceptions import ClientError

        UsernameExistsException = type("UsernameExistsException", (ClientError,), {})
        mock_cognito.exceptions.UsernameExistsException = UsernameExistsException

        error = UsernameExistsException(
            {"Error": {"Code": "UsernameExistsException", "Message": "User exists"}},
            "SignUp",
        )
        mock_cognito.sign_up.side_effect = error

        with pytest.raises(ValueError, match="already exists"):
            register_user("Alice", "existing@example.com")


class TestVerifyUser:
    @patch("website_analyzer.auth._cognito")
    def test_verify_with_password_returns_tokens(self, mock_cognito_factory):
        mock_cognito = MagicMock()
        mock_cognito_factory.return_value = mock_cognito
        mock_cognito.confirm_sign_up.return_value = {}
        mock_cognito.initiate_auth.return_value = {
            "AuthenticationResult": {
                "AccessToken": "at",
                "RefreshToken": "rt",
                "IdToken": "it",
                "ExpiresIn": 3600,
            }
        }

        from website_analyzer.auth import _pending_passwords

        email = "test@example.com"
        _pending_passwords[email] = "TestPassword123"

        result = verify_user(email, "123456")
        assert result["access_token"] == "at"
        assert result["id_token"] == "it"
        assert email not in _pending_passwords

    @patch("website_analyzer.auth._cognito")
    def test_verify_no_password_returns_simple_message(self, mock_cognito_factory):
        mock_cognito = MagicMock()
        mock_cognito_factory.return_value = mock_cognito
        mock_cognito.confirm_sign_up.return_value = {}

        result = verify_user("new@example.com", "123456")
        assert result["message"] == "Email verified successfully."
        assert "access_token" not in result
