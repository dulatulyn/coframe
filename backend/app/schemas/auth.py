from typing import Annotated

from pydantic import AfterValidator, EmailStr, Field, StringConstraints

from app.schemas.common import Schema


def _normalize_email(value: str) -> str:
    return value.strip().lower()


Email = Annotated[EmailStr, AfterValidator(_normalize_email)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Password = Annotated[str, Field(min_length=8, max_length=200)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")]


class SignupIn(Schema):
    email: Email
    password: Password
    name: Name


class LoginIn(Schema):
    email: Email
    password: Annotated[str, Field(min_length=1, max_length=200)]


class UpdateMeIn(Schema):
    name: Name | None = None
    color: Color | None = None
    current_password: str | None = None
    new_password: Password | None = None
