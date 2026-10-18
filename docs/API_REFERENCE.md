# REST API — implemented milestone 1

API prefix: `/api`. Auth uses an `HttpOnly` cookie named `salesos_session`. Use `credentials: include` from the web client. Only explicitly configured browser origin can perform write requests.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` | Sign in with `{email,password}` |
| POST | `/auth/logout` | Clear cookie |
| GET | `/auth/me` | Current user |
| GET | `/users` | Team directory |
| POST | `/users` | Admin creates user (temporary milestone-only provisioning) |
| GET | `/accounts?q=...` | Search visible accounts |
| POST | `/accounts` | Create account and first opportunity |
| GET | `/accounts/:id` | Account detail |
| POST | `/accounts/:id/contacts` | Add verified/unverified buyer contact |
| GET | `/opportunities?stage=...` | Current opportunity list |
| POST | `/opportunities` | Create a new opportunity for existing account |
| GET | `/opportunities/:id` | Opportunity workspace, history, evidence and notes |
| PATCH | `/opportunities/:id/evidence` | Save typed stage evidence and auto-advance if complete |
| POST | `/opportunities/:id/comments` | Persist update to active stage visit |
| POST | `/opportunities/:id/transition` | Guarded manual stage move |
| POST | `/opportunities/:id/close` | Nurture / lost / unqualified with reason |
| POST | `/opportunities/:id/reopen` | Manager reopens with reason |
| POST | `/opportunities/:id/activities` | Log outreach, meeting or response |
| POST | `/opportunities/:id/proposals` | Create pilot proposal |
| POST | `/opportunities/:id/contracts` | Create contract metadata / evidence reference |
| GET | `/tasks` | Visible tasks |
| POST | `/tasks` | Create task |
| PATCH | `/tasks/:id` | Mark task open/done |
| GET | `/campaigns` | Visible campaign records |
| POST | `/campaigns` | New campaign record |
| GET | `/dashboard/summary?days=30` | Real KPI, series, sectors, risk and activity summary |

## Example Create Prospect

```json
{
  "name": "Example Robotics Ltd",
  "website": "https://example-robotics.com",
  "industry": "Autonomous Systems",
  "priority": "HIGH",
  "hypothesis": "Possible need for perception data quality evaluation."
}
```

## Stage evidence and automatic progression

```json
PATCH /api/opportunities/{opportunityId}/evidence
{
  "fields": {
    "companySummary": "Builds robotic perception systems",
    "opportunityHypothesis": "Evaluation of multimodal detection datasets",
    "researchSource": "https://example-robotics.com/research",
    "nextAction": "Identify the technical evaluation owner"
  }
}
```

If the requirement gate is met, the API returns `{ "advanced": true, "stage": "DECISION_MAKER_IDENTIFIED", "missing": [] }` and the board updates after reload.

## Security and response notes

- Team and company access is checked server-side, not with frontend-only gates.
- Stage override requires manager role, explicit `override:true` and reason.
- Signed production agreement is mandatory to enter Closed Won, even under manager override.
- All SQL access uses Prisma; user-entered comments render as plain text and are not interpreted as HTML.
- Credential brute force protection, per-division authorization, file scanning and invitation/password reset are release blockers not yet implemented.
