# Points and bonuses

## Rules

| Rule | Default | Where it is set |
| --- | --- | --- |
| Monthly target | 1,500 points | `point_settings.monthly_target` |
| Office attendance | +100 per verified day | `point_settings.attendance_points` |
| Completed task | Configurable, default 0 | `point_settings.default_task_points`, or `tasks.points_value` for one task |
| Responsibility violation | Configurable deduction | `violation_types.deduction_points` |
| Bonus | ৳1,000 for every full 1,000 points above the target | `point_settings.bonus_step_points`, `point_settings.bonus_step_amount` |

An admin can change all of these on the Employees & Rewards page. Changes apply to points awarded afterwards.

## Monthly reset

Points are not stored as a running balance. Every change is an entry in `point_entries` tagged with its month, and a month's total is the sum of that month's entries.

- On the first day of a month there are no entries for it yet, so everyone starts at zero. Nothing has to run for this to happen.
- Earlier months keep their entries, deductions and bonuses, and can be viewed with the month picker.
- Points do not carry over. Whatever is left after the bonus calculation expires with the month.
- Month boundaries follow the organization's timezone (Asia/Dhaka by default).

## Bonus calculation

```
points above target = total − monthly target
bonus = floor(points above target ÷ 1,000) × ৳1,000     (0 if below one full step)
```

| Month total | Bonus |
| --- | --- |
| 1,500 | ৳0 |
| 2,499 | ৳0 |
| 2,500 | ৳1,000 |
| 3,499 | ৳1,000 |
| 3,500 | ৳2,000 |

## Approval

- After a month has ended, an admin runs "Calculate bonuses" for it. This creates a `pending` bonus for each employee who qualifies.
- A bonus counts only once an admin sets it to `approved`. It can also be `rejected`.
- Running the calculation again refreshes pending bonuses and leaves approved and rejected ones untouched.
- Bonuses cannot be calculated for the current month, because its totals can still change.

## Deductions

- A deduction is a negative point entry with source `violation`. A written reason is required.
- Deductions only reduce points. Nothing in the system reduces salary.
- Admins can also record a manual `adjustment`, positive or negative, with a reason.

## Who decides points

Only an admin decides points. Points appear in three ways, each needing an admin:

- An admin verifies an attendance day.
- An admin approves a task that has a points value (or the organization has a default). The award follows the task: changing its points value or assignee later updates the award, and un-approving it removes the award.
- An admin gives or deducts points by hand, with a reason.

A role with the team points segment (for example Human Resource) can put forward any of these for other people, but it is stored as a change request and counts only once an admin approves it. Nobody can put forward points for themselves.

## Cash flow by month

The Cash Flow page lists payments, invoices and expenses for one month at a time, chosen with the month picker, so every month starts with empty lists. Nothing is deleted: earlier months stay available. Account balances and client dues are always calculated from every entry in every month, and unpaid invoices from earlier months are listed separately until they are settled.
