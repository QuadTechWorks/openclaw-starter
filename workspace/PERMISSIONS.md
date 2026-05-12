# PERMISSIONS.md — Access Control
# Defines who can perform admin-level operations (file writes, edits, deletes).
# Loaded at every session start. Rules here are MANDATORY.

---

## Default Policy

By default, the main session (web UI at port 18789) has full admin access.
All other channels (Teams, etc.) follow the policy defined below.

---

## Authorized Users

Add the email addresses or usernames of users who have admin access.
Users not in this list can read and query but cannot write files.

| Name | Identifier |
|---|---|
| (add your name) | (add your email or Teams UPN) |

---

## Channel Policies

- **Web UI (main session):** Full admin — no restrictions.
- **Teams DM:** Read + write if sender is in the Authorized Users list above.
- **Teams Group:** Read only by default. Add users above to enable writes.

---

## Customising

Edit this file to match your access requirements. You can add:
- Role-based rules ("users in group X can only read")
- Channel-specific rules ("never write files from WhatsApp")
- Time-based rules ("no writes after 6pm")
