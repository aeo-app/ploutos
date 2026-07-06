#!/usr/bin/env python3
"""Create a Cognito User Pool configured for passwordless email OTP."""

import os

import boto3
from dotenv import load_dotenv

load_dotenv()

REGION = os.getenv("COGNITO_REGION", "us-east-1")
cognito = boto3.client("cognito-idp", region_name=REGION)

print(f"Creating user pool in {REGION}...")

pool = cognito.create_user_pool(
    PoolName="default-aws-cognito-pool",
    UsernameAttributes=["email"],
    AutoVerifiedAttributes=["email"],
    Schema=[
        {"Name": "email", "Required": True, "Mutable": True, "AttributeDataType": "String"},
        {"Name": "name", "Required": True, "Mutable": True, "AttributeDataType": "String"},
    ],
    Policies={
        "PasswordPolicy": {
            "MinimumLength": 8,
            "RequireUppercase": True,
            "RequireLowercase": True,
            "RequireNumbers": True,
            "RequireSymbols": False,
        }
    },
    AccountRecoverySetting={
        "RecoveryMechanisms": [
            {"Priority": 1, "Name": "verified_email"},
        ]
    },
    EmailConfiguration={
        "EmailSendingAccount": "COGNITO_DEFAULT",
    },
)

pool_id = pool["UserPool"]["Id"]
print(f"Pool created: {pool_id}")

client = cognito.create_user_pool_client(
    UserPoolId=pool_id,
    ClientName="default-aws-cognito-client",
    ExplicitAuthFlows=[
        "ALLOW_USER_AUTH",
        "ALLOW_REFRESH_TOKEN_AUTH",
        "ALLOW_USER_PASSWORD_AUTH",
    ],
    PreventUserExistenceErrors="ENABLED",
)

client_id = client["UserPoolClient"]["ClientId"]
print(f"App client created: {client_id}")

print()
print("=== Add these to .env ===")
print(f"COGNITO_USER_POOL_ID={pool_id}")
print(f"COGNITO_CLIENT_ID={client_id}")
print(f"COGNITO_REGION={REGION}")
