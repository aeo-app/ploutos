import csv
import argparse
import boto3
from botocore.exceptions import ClientError
from decimal import Decimal


# ============================================================
# CONFIGURATION
# ============================================================

CSV_FILE = "selected.csv"
EMAIL_FILE = "emails.txt"

AWS_REGION = "ap-southeast-1"

# AWS CLI profiles
#
# The source profile is only needed if you later want the script
# to read directly from the old AWS account.
#
# Since we are currently using CSV, only the NEW account profile
# is required for writing to DynamoDB / reading Cognito.

NEW_AWS_PROFILE = "default"

# New Cognito User Pool
NEW_USER_POOL_ID = "ap-southeast-1_U9HDAr53a"

# New DynamoDB table
NEW_DYNAMODB_TABLE = "apac_seo_analyses"


# ============================================================
# COMMAND LINE
# ============================================================

parser = argparse.ArgumentParser(
    description="Migrate DynamoDB records to another AWS account"
)

parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Show migration details without writing to DynamoDB"
)

args = parser.parse_args()


# ============================================================
# AWS SESSION
# ============================================================

session = boto3.Session(
    profile_name=NEW_AWS_PROFILE,
    region_name=AWS_REGION
)

dynamodb = session.resource("dynamodb")
cognito = session.client("cognito-idp")

table = dynamodb.Table(NEW_DYNAMODB_TABLE)


# ============================================================
# READ EMAIL LIST
# ============================================================

def load_emails():
    emails = set()

    with open(
        EMAIL_FILE,
        "r",
        encoding="utf-8"
    ) as file:

        for line in file:

            email = line.strip().lower()

            if email:
                emails.add(email)

    return emails


# ============================================================
# FIND OLD COGNITO USERS FROM CSV
# ============================================================

def build_old_user_mapping(rows, target_emails):

    """
    Find REGISTRY records.

    Example CSV:

    PK       = REGISTRY
    SK       = USER#090a554c-...
    email    = user@example.com
    user_id  = 090a554c-...

    Result:

    {
        "090a554c-...": "user@example.com"
    }
    """

    old_id_to_email = {}

    for row in rows:

        if row.get("PK") != "REGISTRY":
            continue

        email = (row.get("email") or "").strip().lower()

        user_id = (row.get("user_id") or "").strip()

        if not email or not user_id:
            continue

        if email in target_emails:

            old_id_to_email[user_id] = email

    return old_id_to_email


# ============================================================
# FIND NEW COGNITO USER BY EMAIL
# ============================================================

def find_new_cognito_user(email):

    """
    Find the user in the NEW Cognito User Pool.

    Cognito requires pagination because the user pool
    can contain many users.
    """

    pagination_token = None

    while True:

        try:

            params = {
                "UserPoolId": NEW_USER_POOL_ID,
                "Filter": f'email = "{email}"',
                "Limit": 60
            }

            if pagination_token:
                params["PaginationToken"] = pagination_token

            response = cognito.list_users(**params)

        except ClientError as error:

            print(
                f"[ERROR] Cognito lookup failed for {email}: "
                f"{error}"
            )

            return None

        users = response.get("Users", [])

        if users:

            user = users[0]

            for attribute in user.get("Attributes", []):

                if attribute.get("Name") == "sub":

                    return attribute.get("Value")

            print(
                f"[ERROR] User found but sub is missing: {email}"
            )

            return None

        pagination_token = response.get("PaginationToken")

        if not pagination_token:
            break

    print(
        f"[NOT FOUND] Email does not exist in new Cognito: "
        f"{email}"
    )

    return None


# ============================================================
# BUILD OLD ID -> NEW ID MAPPING
# ============================================================

def build_cognito_mapping(old_id_to_email):

    mapping = {}

    print()
    print("=" * 70)
    print("COGNITO USER MAPPING")
    print("=" * 70)

    for old_id, email in old_id_to_email.items():

        new_id = find_new_cognito_user(email)

        if not new_id:

            print(
                f"[SKIP] Cannot migrate user "
                f"{email}"
            )

            continue

        mapping[old_id] = new_id

        print()
        print(f"Email    : {email}")
        print(f"Old ID   : {old_id}")
        print(f"New ID   : {new_id}")

    return mapping


# ============================================================
# CONVERT CSV VALUE
# ============================================================

def convert_value(value):

    """
    Convert CSV strings into Python values.

    Empty CSV values are ignored.

    JSON values are converted back into Python
    dictionaries/lists where possible.
    """

    if value is None:
        return None

    value = value.strip()

    if value == "":
        return None

    # Try JSON parsing
    try:

        import json

        return json.loads(value)

    except (ValueError, TypeError):

        return value


# ============================================================
# CREATE DYNAMODB ITEM
# ============================================================

def create_item(row, cognito_mapping):

    old_pk = (row.get("PK") or "").strip()

    # --------------------------------------------------------
    # Only migrate records belonging to selected users.
    #
    # REGISTRY records are handled separately.
    # --------------------------------------------------------

    if old_pk == "REGISTRY":

        return None

    if old_pk not in cognito_mapping:

        return None

    new_cognito_id = cognito_mapping[old_pk]

    item = {}

    for key, value in row.items():

        converted = convert_value(value)

        if converted is None:
            continue

        # ----------------------------------------------------
        # Replace PK
        # ----------------------------------------------------

        if key == "PK":

            item[key] = new_cognito_id

        # ----------------------------------------------------
        # Replace user_id
        # ----------------------------------------------------

        elif key == "user_id":

            # Only replace when it is the old Cognito ID
            if converted == old_pk:
                item[key] = new_cognito_id
            else:
                item[key] = converted

        # ----------------------------------------------------
        # Keep everything else unchanged
        # ----------------------------------------------------

        else:

            item[key] = converted

    return item


# ============================================================
# WRITE TO DYNAMODB
# ============================================================

def write_items(items):

    success = 0
    failed = 0

    print()
    print("=" * 70)
    print("WRITING TO NEW DYNAMODB")
    print("=" * 70)

    # DynamoDB batch_writer automatically handles:
    #
    # - batches of 25
    # - retries
    # - unprocessed items

    with table.batch_writer(
        overwrite_by_pkeys=["PK", "SK"]
    ) as batch:

        for item in items:

            try:

                batch.put_item(
                    Item=item
                )

                success += 1

                print(
                    f"[SUCCESS] "
                    f"PK={item.get('PK')} "
                    f"SK={item.get('SK')}"
                )

            except ClientError as error:

                failed += 1

                print(
                    f"[FAILED] "
                    f"PK={item.get('PK')} "
                    f"SK={item.get('SK')}"
                )

                print(error)

    return success, failed


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 70)
    print("DYNAMODB ACCOUNT MIGRATION")
    print("=" * 70)

    # --------------------------------------------------------
    # Load email list
    # --------------------------------------------------------

    target_emails = load_emails()

    print()
    print(f"Emails to migrate: {len(target_emails)}")

    # --------------------------------------------------------
    # Read CSV
    # --------------------------------------------------------

    print()
    print(f"Reading CSV: {CSV_FILE}")

    with open(
        CSV_FILE,
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        rows = list(reader)

    print(f"CSV records: {len(rows)}")

    # --------------------------------------------------------
    # Build old Cognito ID -> email
    # --------------------------------------------------------

    old_id_to_email = build_old_user_mapping(
        rows,
        target_emails
    )

    print()
    print(
        f"Old Cognito users found: "
        f"{len(old_id_to_email)}"
    )

    # --------------------------------------------------------
    # Find new Cognito IDs
    # --------------------------------------------------------

    cognito_mapping = build_cognito_mapping(
        old_id_to_email
    )

    print()
    print(
        f"Successfully mapped users: "
        f"{len(cognito_mapping)}"
    )

    # --------------------------------------------------------
    # Create migrated records
    # --------------------------------------------------------

    migrated_items = []

    skipped = 0

    for row in rows:

        item = create_item(
            row,
            cognito_mapping
        )

        if item is None:

            skipped += 1

            continue

        migrated_items.append(item)

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print()
    print("=" * 70)
    print("MIGRATION SUMMARY")
    print("=" * 70)

    print(
        f"Target emails          : {len(target_emails)}"
    )

    print(
        f"Old Cognito users      : {len(old_id_to_email)}"
    )

    print(
        f"New Cognito users      : {len(cognito_mapping)}"
    )

    print(
        f"Records to migrate     : {len(migrated_items)}"
    )

    print(
        f"Records skipped        : {skipped}"
    )

    # --------------------------------------------------------
    # Dry run
    # --------------------------------------------------------

    if args.dry_run:

        print()
        print("=" * 70)
        print("DRY RUN - NO DATA WAS WRITTEN")
        print("=" * 70)

        for item in migrated_items:

            print(
                f"PK={item.get('PK')} "
                f"SK={item.get('SK')}"
            )

        return

    # --------------------------------------------------------
    # Write to DynamoDB
    # --------------------------------------------------------

    success, failed = write_items(
        migrated_items
    )

    # --------------------------------------------------------
    # Final result
    # --------------------------------------------------------

    print()
    print("=" * 70)
    print("MIGRATION COMPLETED")
    print("=" * 70)

    print(f"Successful : {success}")
    print(f"Failed     : {failed}")


if __name__ == "__main__":
    main()